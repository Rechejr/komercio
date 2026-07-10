import { Router, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { success, created, paginated, AppError } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { validate } from '../middlewares/validate';

const transferValidators = [
  body('fromBranchId').isUUID().withMessage('Bodega de origen inválida'),
  body('toBranchId').isUUID().withMessage('Bodega de destino inválida'),
  body('items').isArray({ min: 1 }).withMessage('Se requiere al menos un producto'),
  body('items.*.productId').isUUID().withMessage('productId inválido'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Cantidad debe ser mayor a 0'),
  body('notes').optional().trim(),
];

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { branchId } = req.query;
    const businessId = req.user!.businessId;

    const where: any = { businessId };
    if (branchId) where.OR = [{ fromBranchId: branchId }, { toBranchId: branchId }];

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
      where: { id: req.params.id, businessId: req.user!.businessId },
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

    if (fromBranchId === toBranchId) {
      throw new AppError('La bodega de origen y destino deben ser distintas', 400);
    }

    const branches = await prisma.branch.findMany({
      where: { id: { in: [fromBranchId, toBranchId] }, businessId, deletedAt: null },
      select: { id: true },
    });
    if (branches.length !== 2) throw new AppError('Bodega no válida para este negocio', 403);

    const productIds: string[] = items.map((item: any) => item.productId);
    const validCount = await prisma.product.count({
      where: { id: { in: productIds }, businessId, deletedAt: null },
    });
    if (validCount !== productIds.length) {
      throw new AppError('Uno o más productos no pertenecen a este negocio', 403);
    }

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

      // Punto crítico de concurrencia: se bloquean las filas de origen Y destino
      // en UN SOLO orden consistente (productId, luego branchId) — bloquear
      // "primero todo el origen, luego todo el destino" haría deadlock contra
      // una transferencia simultánea en sentido contrario entre estas mismas
      // dos bodegas. Extiende el mismo patrón de "ordenar antes de bloquear"
      // que ya usa sale.controller.ts al vender varios productos.
      interface LockTarget { productId: string; branchId: string; quantity: number; role: 'from' | 'to' }
      const targets: LockTarget[] = items.flatMap((i: any) => [
        { productId: i.productId, branchId: fromBranchId, quantity: parseFloat(i.quantity), role: 'from' as const },
        { productId: i.productId, branchId: toBranchId, quantity: parseFloat(i.quantity), role: 'to' as const },
      ]).sort((a: LockTarget, b: LockTarget) => (a.productId + a.branchId).localeCompare(b.productId + b.branchId));

      interface ProductRow { allowNegativeStock: boolean; name: string; }
      const productInfo = new Map<string, ProductRow>();

      const lockedStock = new Map<string, number>(); // key: productId|branchId
      for (const t of targets) {
        const [row] = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 0, now(), now())
           ON CONFLICT ("productId", "branchId") DO UPDATE SET "updatedAt" = product_stocks."updatedAt"
           RETURNING stock`,
          randomUUID(), t.productId, t.branchId,
        );
        lockedStock.set(`${t.productId}|${t.branchId}`, Number(row.stock));

        if (!productInfo.has(t.productId)) {
          const p = await tx.product.findUnique({ where: { id: t.productId }, select: { allowNegativeStock: true, name: true } });
          if (p) productInfo.set(t.productId, p);
        }
      }

      for (const item of items) {
        const qty = parseFloat(item.quantity);
        const product = productInfo.get(item.productId)!;
        const fromKey = `${item.productId}|${fromBranchId}`;
        const toKey = `${item.productId}|${toBranchId}`;
        const fromStock = lockedStock.get(fromKey)!;
        const toStock = lockedStock.get(toKey)!;

        if (fromStock - qty < 0 && !product.allowNegativeStock) {
          throw new AppError(`Stock insuficiente en la bodega de origen para: ${product.name}`, 400);
        }

        await tx.productStock.update({
          where: { productId_branchId: { productId: item.productId, branchId: fromBranchId } },
          data: { stock: { decrement: qty } },
        });
        await tx.productStock.update({
          where: { productId_branchId: { productId: item.productId, branchId: toBranchId } },
          data: { stock: { increment: qty } },
        });

        // Product.stock (el total) NO se toca — una transferencia solo mueve
        // ubicación, no cambia cuánto hay en total del negocio.
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId, type: 'OUT', quantity: qty,
            previousStock: fromStock, newStock: fromStock - qty,
            reason: 'Transferencia entre bodegas', referenceId: newTransfer.id, referenceType: 'TRANSFER',
            branchId: fromBranchId,
          },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId, type: 'IN', quantity: qty,
            previousStock: toStock, newStock: toStock + qty,
            reason: 'Transferencia entre bodegas', referenceId: newTransfer.id, referenceType: 'TRANSFER',
            branchId: toBranchId,
          },
        });
      }

      return newTransfer;
    });

    return created(res, transfer, 'Transferencia registrada');
  } catch (err) { next(err); }
});

export default router;
