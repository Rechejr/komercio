import { Router, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { success, created, paginated, AppError } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { validate } from '../middlewares/validate';

const transferValidators = [
  body('fromBranchId').isUUID().withMessage('Bodega de origen inválida'),
  body('toBranchId').isUUID().withMessage('Bodega de destino inválida'),
  body('items').isArray({ min: 1 }).withMessage('Se requiere al menos un producto'),
  body('items.*.productId').isUUID().withMessage('productId inválido'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Cantidad debe ser mayor a 0'),
  body('notes').optional().trim(),
];

// ─── Ajustes de stock por (producto, bodega) ──────────────────────────────────
// Crear, editar y anular una transferencia son la MISMA operación vista desde
// distintos ángulos: un conjunto de deltas por producto+bodega. Editar se
// modela como "revertir lo viejo + aplicar lo nuevo" ya sumado en un solo
// delta neto por clave; así, cambiar la cantidad de 10 a 12 mueve 2 unidades y
// no 22, y cambiar la bodega de destino sale solo (la vieja queda con delta
// negativo y la nueva con positivo).

type DeltaMap = Map<string, number>; // clave: `${productId}|${branchId}`

function addDelta(deltas: DeltaMap, productId: string, branchId: string, qty: number): void {
  const key = `${productId}|${branchId}`;
  deltas.set(key, (deltas.get(key) || 0) + qty);
}

// Deltas de una transferencia: sale del origen, entra al destino. `sign` = -1
// invierte el movimiento completo (revertir una transferencia existente).
function collectTransferDeltas(
  deltas: DeltaMap,
  items: Array<{ productId: string; quantity: unknown }>,
  fromBranchId: string,
  toBranchId: string,
  sign: 1 | -1,
): void {
  for (const item of items) {
    const qty = Number(item.quantity);
    addDelta(deltas, item.productId, fromBranchId, -qty * sign);
    addDelta(deltas, item.productId, toBranchId, qty * sign);
  }
}

interface ApplyDeltasOptions {
  reason: string;
  referenceId: string;
  branchNames: Map<string, string>;
  /** Prefijo del error de stock insuficiente, ej. 'No se puede eliminar la transferencia: '. */
  errorPrefix?: string;
}

async function applyStockDeltas(tx: Prisma.TransactionClient, deltas: DeltaMap, opts: ApplyDeltasOptions): Promise<void> {
  // Punto crítico de concurrencia: se bloquean las filas de TODAS las bodegas
  // involucradas en UN SOLO orden consistente (la clave productId|branchId
  // ordenada) — bloquear "primero todo el origen, luego todo el destino" haría
  // deadlock contra una transferencia simultánea en sentido contrario entre
  // estas mismas dos bodegas. Es el mismo patrón de "ordenar antes de
  // bloquear" que ya usa sale.controller.ts al vender varios productos.
  const entries = [...deltas.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  interface ProductRow { allowNegativeStock: boolean; name: string }
  const productInfo = new Map<string, ProductRow>();
  const lockedStock = new Map<string, number>();

  for (const [key] of entries) {
    const [productId, branchId] = key.split('|');
    const [row] = await tx.$queryRawUnsafe<Array<{ stock: number }>>(
      `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 0, now(), now())
       ON CONFLICT ("productId", "branchId") DO UPDATE SET "updatedAt" = product_stocks."updatedAt"
       RETURNING stock`,
      randomUUID(), productId, branchId,
    );
    lockedStock.set(key, Number(row.stock));

    if (!productInfo.has(productId)) {
      const p = await tx.product.findUnique({ where: { id: productId }, select: { allowNegativeStock: true, name: true } });
      if (p) productInfo.set(productId, p);
    }
  }

  // Se valida TODO antes de escribir nada: si una sola línea deja una bodega en
  // negativo, la operación completa se rechaza sin dejar stock a medio mover.
  for (const [key, delta] of entries) {
    if (delta >= 0) continue;
    const [productId, branchId] = key.split('|');
    const product = productInfo.get(productId);
    if (!product || product.allowNegativeStock) continue;
    if (lockedStock.get(key)! + delta < 0) {
      const branchName = opts.branchNames.get(branchId) || 'esa bodega';
      const detail = `stock insuficiente de "${product.name}" en ${branchName}`;
      throw new AppError(
        opts.errorPrefix ? `${opts.errorPrefix}${detail}` : detail.charAt(0).toUpperCase() + detail.slice(1),
        400,
      );
    }
  }

  for (const [key, delta] of entries) {
    // Product.stock (el total del negocio) NO se toca — una transferencia solo
    // mueve ubicación, no cambia cuánto hay en total.
    if (delta === 0) continue;
    const [productId, branchId] = key.split('|');
    const previousStock = lockedStock.get(key)!;
    await tx.productStock.update({
      where: { productId_branchId: { productId, branchId } },
      data: { stock: { increment: delta } },
    });
    await tx.inventoryMovement.create({
      data: {
        productId,
        type: delta > 0 ? 'IN' : 'OUT',
        quantity: Math.abs(delta),
        previousStock,
        newStock: previousStock + delta,
        reason: opts.reason,
        referenceId: opts.referenceId,
        referenceType: 'TRANSFER',
        branchId,
      },
    });
  }
}

// Valida que ambas bodegas existan en el negocio y devuelve sus nombres (para
// los mensajes de stock insuficiente).
async function assertBranches(businessId: string, fromBranchId: string, toBranchId: string): Promise<Map<string, string>> {
  if (fromBranchId === toBranchId) {
    throw new AppError('La bodega de origen y destino deben ser distintas', 400);
  }
  const branches = await prisma.branch.findMany({
    where: { id: { in: [fromBranchId, toBranchId] }, businessId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (branches.length !== 2) throw new AppError('Bodega no válida para este negocio', 403);
  return new Map(branches.map((b) => [b.id, b.name]));
}

async function assertProducts(businessId: string, items: Array<{ productId: string }>): Promise<void> {
  // Dedupe primero: un mismo producto puede aparecer en varias líneas y
  // `product.count` con `in` solo cuenta filas distintas — sin el dedupe el
  // conteo nunca cuadraba y rechazaba transferencias válidas con un 403.
  const productIds = [...new Set(items.map((item) => item.productId))];
  const validCount = await prisma.product.count({
    where: { id: { in: productIds }, businessId, deletedAt: null },
  });
  if (validCount !== productIds.length) {
    throw new AppError('Uno o más productos no pertenecen a este negocio', 403);
  }
}

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const search = getSearch(req);
    const { branchId, startDate, endDate } = req.query;
    const businessId = req.user!.businessId;

    // Se usa AND para poder combinar el filtro por bodega, la búsqueda y las fechas
    // (cada uno con su propio OR) sin que se pisen en la misma clave `where.OR`.
    const and: any[] = [];
    if (branchId) and.push({ OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] });
    if (search) {
      and.push({
        OR: [
          { fromBranch: { name: { contains: search, mode: 'insensitive' } } },
          { toBranch: { name: { contains: search, mode: 'insensitive' } } },
          { notes: { contains: search, mode: 'insensitive' } },
          { items: { some: { product: { name: { contains: search, mode: 'insensitive' } } } } },
        ],
      });
    }

    const where: any = { businessId, deletedAt: null };
    if (and.length) where.AND = and;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) {
        const end = new Date(endDate as string);
        end.setUTCHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [transfers, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          fromBranch: { select: { id: true, name: true } },
          toBranch: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.stockTransfer.count({ where }),
    ]);
    return paginated(res, transfers, total, page, limit);
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const transfer = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, businessId: req.user!.businessId, deletedAt: null },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        items: { include: { product: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!transfer) throw new AppError('Transferencia no encontrada', 404);
    return success(res, transfer);
  } catch (err) { next(err); }
});

// Solo ADMIN/SUPERVISOR — mover mercancía entre bodegas es una decisión del
// dueño/encargado, no del cajero (mismo criterio que editar/eliminar compras).
router.post('/', authorize('ADMIN', 'SUPERVISOR'), transferValidators, validate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fromBranchId, toBranchId, items, notes } = req.body;
    const businessId = req.user!.businessId;

    const branchNames = await assertBranches(businessId!, fromBranchId, toBranchId);
    await assertProducts(businessId!, items);

    const transfer = await prisma.$transaction(async (tx) => {
      const newTransfer = await tx.stockTransfer.create({
        data: {
          businessId: businessId!,
          fromBranchId,
          toBranchId,
          createdById: req.user!.userId,
          notes,
          items: { create: items.map((i: any) => ({ productId: i.productId, quantity: parseFloat(i.quantity) })) },
        },
      });

      const deltas: DeltaMap = new Map();
      collectTransferDeltas(deltas, items, fromBranchId, toBranchId, 1);
      await applyStockDeltas(tx, deltas, {
        reason: 'Transferencia entre bodegas',
        referenceId: newTransfer.id,
        branchNames,
      });

      return newTransfer;
    });

    return created(res, transfer, 'Transferencia registrada');
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'SUPERVISOR'), transferValidators, validate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fromBranchId, toBranchId, items, notes } = req.body;
    const businessId = req.user!.businessId;

    const existing = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, businessId, deletedAt: null },
      include: {
        items: true,
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new AppError('Transferencia no encontrada', 404);

    const branchNames = await assertBranches(businessId!, fromBranchId, toBranchId);
    await assertProducts(businessId!, items);
    // Las bodegas viejas pueden ya no ser las nuevas (o incluso estar
    // eliminadas): igual hacen falta sus nombres para los mensajes de error.
    branchNames.set(existing.fromBranch.id, existing.fromBranch.name);
    branchNames.set(existing.toBranch.id, existing.toBranch.name);

    const updated = await prisma.$transaction(async (tx) => {
      const deltas: DeltaMap = new Map();
      collectTransferDeltas(deltas, existing.items, existing.fromBranchId, existing.toBranchId, -1);
      collectTransferDeltas(deltas, items, fromBranchId, toBranchId, 1);
      await applyStockDeltas(tx, deltas, {
        reason: 'Edición de transferencia',
        referenceId: existing.id,
        branchNames,
        errorPrefix: 'No se puede editar la transferencia: ',
      });

      await tx.stockTransferItem.deleteMany({ where: { transferId: existing.id } });
      return tx.stockTransfer.update({
        where: { id: existing.id },
        data: {
          fromBranchId,
          toBranchId,
          notes: notes ?? null,
          items: { create: items.map((i: any) => ({ productId: i.productId, quantity: parseFloat(i.quantity) })) },
        },
      });
    });

    return success(res, updated, 'Transferencia actualizada');
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN', 'SUPERVISOR'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, businessId: req.user!.businessId, deletedAt: null },
      include: {
        items: true,
        fromBranch: { select: { id: true, name: true } },
        toBranch: { select: { id: true, name: true } },
      },
    });
    if (!existing) throw new AppError('Transferencia no encontrada', 404);

    await prisma.$transaction(async (tx) => {
      // Revertir puede dejar el DESTINO en negativo si ya se vendió desde allí
      // lo que llegó con esta transferencia — en ese caso se bloquea, igual que
      // al eliminar una compra cuya mercancía ya se vendió.
      const deltas: DeltaMap = new Map();
      collectTransferDeltas(deltas, existing.items, existing.fromBranchId, existing.toBranchId, -1);
      await applyStockDeltas(tx, deltas, {
        reason: 'Anulación de transferencia',
        referenceId: existing.id,
        branchNames: new Map([
          [existing.fromBranch.id, existing.fromBranch.name],
          [existing.toBranch.id, existing.toBranch.name],
        ]),
        errorPrefix: 'No se puede eliminar la transferencia: ',
      });

      await tx.stockTransfer.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    });

    return success(res, null, 'Transferencia eliminada y stock revertido');
  } catch (err) { next(err); }
});

export default router;
