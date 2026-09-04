import { Router, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { requirePermission } from '../middlewares/permissions';
import { resolveEffectiveBranchId } from '../utils/resolveBranch';
import { success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { parseBogotaBoundary } from '../utils/bogotaTime';
import { AppError } from '../utils/response';
import { validate } from '../middlewares/validate';
import { planLimit } from '../middlewares/planLimit';
import { resolvePayment } from '../utils/paymentAccount';

const purchaseItemValidators = [
  body('items').isArray({ min: 1 }).withMessage('Se requieren productos'),
  body('items.*.productId').isUUID().withMessage('productId inválido'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Cantidad debe ser mayor a 0'),
  body('items.*.unitCost').isFloat({ min: 0 }).withMessage('Costo unitario inválido'),
  body('items.*.taxRate').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }).withMessage('IVA inválido'),
  body('items.*.branchId').optional({ nullable: true }).isUUID().withMessage('branchId de línea inválido'),
  body('branchId').optional().isUUID().withMessage('branchId inválido'),
  body('invoiceNumber').optional().trim(),
  body('notes').optional().trim(),
  body('paymentMethod').optional().isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD', 'MIXED']).withMessage('Método de pago inválido'),
  body('paymentAccountId').optional({ nullable: true }).isString(),
  // Pago dividido: varias líneas { paymentAccountId, amount } + opción de crédito.
  body('payments').optional().isArray(),
  body('payments.*.paymentAccountId').optional({ nullable: true }).isString(),
  body('payments.*.amount').optional().isFloat({ min: 0 }),
  body('credit').optional(),
  body('credit.amount').optional({ nullable: true }).isFloat({ min: 0 }),
  body('credit.dueDate').optional({ nullable: true, checkFalsy: true }).isISO8601(),
];

const roundCOP = (n: number) => Math.round(n);

// Resuelve el pago de una compra: soporta pago simple (paymentMethod/paymentAccountId,
// como siempre) o pago DIVIDIDO (payments[] + credit). Devuelve todo lo que la
// compra necesita: método, cuenta, monto pagado, desglose, efectivo para la caja
// y el monto que queda a crédito con el proveedor.
async function buildPurchasePayment(body: any, businessId: string, total: number): Promise<{
  paymentMethod: string; paymentAccountId: string | null; paidAmount: number;
  paymentDetails: { splits: Array<{ method: string; amount: number; paymentAccountId: string | null }> } | null;
  cashAmount: number; creditAmount: number; creditDueDate: Date | null;
}> {
  const payments: Array<{ paymentAccountId?: string; amount: number | string }> = Array.isArray(body.payments) ? body.payments : [];
  const hasSplit = payments.length > 0 || (body.credit && Number(body.credit.amount) > 0);

  if (!hasSplit) {
    // Pago simple (comportamiento de siempre): un solo medio cubre el total.
    const resolved = await resolvePayment({ paymentAccountId: body.paymentAccountId, paymentMethod: body.paymentMethod }, businessId);
    return {
      paymentMethod: resolved.paymentMethod, paymentAccountId: resolved.paymentAccountId,
      paidAmount: total, paymentDetails: null,
      cashAmount: resolved.paymentMethod === 'CASH' ? total : 0,
      creditAmount: 0, creditDueDate: null,
    };
  }

  // Pago dividido: resolver cada medio (valida que la cuenta sea del negocio).
  const splits: Array<{ method: string; amount: number; paymentAccountId: string | null }> = [];
  for (const p of payments) {
    const amount = roundCOP(Number(p.amount));
    if (!(amount > 0)) continue;
    const resolved = await resolvePayment({ paymentAccountId: p.paymentAccountId }, businessId);
    splits.push({ method: resolved.paymentMethod, amount, paymentAccountId: resolved.paymentAccountId });
  }
  const paidSum = roundCOP(splits.reduce((s, x) => s + x.amount, 0));
  const creditAmount = body.credit?.amount != null ? roundCOP(Number(body.credit.amount)) : roundCOP(total - paidSum);

  if (paidSum < 0 || creditAmount < 0) throw new AppError('Los montos de pago no pueden ser negativos', 400);
  if (Math.abs(paidSum + creditAmount - total) > 1) {
    throw new AppError('La suma de los pagos y el crédito no coincide con el total de la compra', 400);
  }
  if (paidSum === 0 && creditAmount === 0) throw new AppError('Indica cómo se paga la compra', 400);

  const cashAmount = roundCOP(splits.filter((s) => s.method === 'CASH').reduce((s, x) => s + x.amount, 0));
  const creditDueDate = body.credit?.dueDate ? new Date(body.credit.dueDate) : null;

  // Si es un solo medio y sin crédito, se guarda como pago simple (no MIXED) para
  // que el badge de pago siga mostrando la cuenta, como antes.
  if (splits.length === 1 && creditAmount === 0) {
    return {
      paymentMethod: splits[0].method, paymentAccountId: splits[0].paymentAccountId,
      paidAmount: total, paymentDetails: null, cashAmount, creditAmount: 0, creditDueDate: null,
    };
  }

  return {
    paymentMethod: 'MIXED', paymentAccountId: null, paidAmount: paidSum,
    paymentDetails: { splits }, cashAmount, creditAmount, creditDueDate,
  };
}

// Compras de antes de esta función quedaron con branchId null — al editarlas o
// eliminarlas se asume la bodega más antigua del negocio, la misma a la que el
// script de backfill le asignó todo el stock histórico.
async function resolvePurchaseBranchId(tx: { branch: { findFirst: typeof prisma.branch.findFirst } }, businessId: string, existingBranchId: string | null): Promise<string> {
  if (existingBranchId) return existingBranchId;
  const oldest = await tx.branch.findFirst({ where: { businessId, deletedAt: null }, orderBy: { createdAt: 'asc' }, select: { id: true } });
  if (!oldest) throw new AppError('No se encontró una bodega para este negocio', 400);
  return oldest.id;
}

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('compras.ver'), async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const search = getSearch(req);
    const { startDate, endDate } = req.query;
    const businessId = req.user!.businessId;

    const where: any = { deletedAt: null, businessId };
    if (search) {
      // Busca por N° de factura del proveedor, nombre/razón social e identificación.
      // El filtro por documento SOLO si hay dígitos (`contains: ''` matchearía todo).
      const digits = search.replace(/\D/g, '');
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
        { supplier: { legalName: { contains: search, mode: 'insensitive' } } },
        ...(digits ? [{ supplier: { document: { contains: digits } } }] : []),
      ];
    }
    if (startDate || endDate) {
      // Límites en hora de Colombia (ver parseBogotaBoundary): con UTC se colaban
      // compras del día anterior/siguiente al filtrar.
      where.purchaseDate = {};
      const start = parseBogotaBoundary(startDate, 'start');
      const end = parseBogotaBoundary(endDate, 'end');
      if (start) where.purchaseDate.gte = start;
      if (end) where.purchaseDate.lte = end;
    }

    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        skip, take: limit, orderBy: { purchaseDate: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { details: true } },
        },
      }),
      prisma.purchase.count({ where }),
    ]);
    return paginated(res, purchases, total, page, limit);
  } catch (err) { next(err); }
});

// Debe ir antes de "/:id" — si no, Express la interpreta como un id.
router.get('/check-invoice', requirePermission('compras.ver'), async (req: AuthRequest, res, next) => {
  try {
    const supplierId = req.query.supplierId as string | undefined;
    const invoiceNumber = ((req.query.invoiceNumber as string) || '').trim();
    const excludeId = req.query.excludeId as string | undefined;
    if (!supplierId || !invoiceNumber) return success(res, { duplicate: false });

    const existing = await prisma.purchase.findFirst({
      where: {
        businessId: req.user!.businessId,
        supplierId,
        deletedAt: null,
        invoiceNumber: { equals: invoiceNumber, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true, purchaseDate: true, total: true },
      orderBy: { purchaseDate: 'desc' },
    });
    return success(res, { duplicate: !!existing, existing: existing || null });
  } catch (err) { next(err); }
});

router.get('/:id', requirePermission('compras.ver'), async (req: AuthRequest, res, next) => {
  try {
    const purchase = await prisma.purchase.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
      include: {
        supplier: true,
        details: { include: { product: { select: { id: true, name: true, code: true } } } },
      },
    });
    if (!purchase) throw new AppError('Compra no encontrada', 404);
    return success(res, purchase);
  } catch (err) { next(err); }
});

// CASHIER puede registrar la compra (ej. un proveedor entrega un pedido y el
// cajero lo recibe), pero no editar/eliminar una ya registrada — esa sigue
// siendo una acción de ADMIN/SUPERVISOR/WAREHOUSE.
router.post('/', requirePermission('compras.gestionar'), planLimit.purchases(),
  [body('supplierId').isUUID().withMessage('Selecciona un proveedor'), ...purchaseItemValidators],
  validate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { supplierId, invoiceNumber, items, notes, purchaseDate, branchId } = req.body;
    if (!items?.length) throw new AppError('Se requieren productos', 400);
    const businessId = req.user!.businessId;

    // Total de la compra (para validar el pago) — mismo cálculo que dentro de la tx.
    const computedTotal = roundCOP(items.reduce((s: number, it: any) => {
      const lineSub = parseFloat(it.unitCost) * parseFloat(it.quantity);
      return s + lineSub + lineSub * ((parseFloat(it.taxRate) || 0) / 100);
    }, 0));
    // Resuelve el pago: simple (un medio) o dividido (payments[] + crédito).
    const pay = await buildPurchasePayment(req.body, businessId!, computedTotal);

    // Validate all products belong to this business before starting the transaction.
    // Dedupe primero — con bodega por línea, un mismo producto puede repetirse en
    // varias líneas (para repartirlo entre bodegas), y `product.count` con `in`
    // solo cuenta filas distintas: sin el dedupe, el conteo nunca cuadraba con
    // `productIds.length` y rechazaba compras válidas con "no pertenecen a este negocio".
    const productIds: string[] = [...new Set<string>(items.map((item: any) => item.productId))];
    const validCount = await prisma.product.count({
      where: { id: { in: productIds }, businessId, deletedAt: null },
    });
    if (validCount !== productIds.length) {
      throw new AppError('Uno o más productos no pertenecen a este negocio', 403);
    }

    let sup: { name: string } | null = null;
    if (supplierId) {
      sup = await prisma.supplier.findFirst({ where: { id: supplierId, businessId, deletedAt: null }, select: { name: true } });
      if (!sup) throw new AppError('Proveedor inválido', 400);
    }

    // Cada línea puede traer su propia bodega (una sola factura puede repartir
    // mercancía entre varias bodegas); si no, cae al branchId de nivel
    // superior. Se resuelve ANTES de abrir la transacción para fallar rápido
    // con 403 si un cajero con bodega fija intenta escribir en otra.
    const itemBranchIds = await Promise.all(
      items.map((item: any) => resolveEffectiveBranchId(prisma, req, item.branchId || branchId)),
    );

    const purchase = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let taxAmount = 0;

      const details = items.map((item: any, idx: number) => {
        const lineSub = parseFloat(item.unitCost) * parseFloat(item.quantity);
        const lineTax = lineSub * ((parseFloat(item.taxRate) || 0) / 100);
        subtotal += lineSub;
        taxAmount += lineTax;
        return {
          productId: item.productId,
          quantity: parseFloat(item.quantity),
          unitCost: parseFloat(item.unitCost),
          taxRate: parseFloat(item.taxRate) || 0,
          subtotal: lineSub,
          total: lineSub + lineTax,
          branchId: itemBranchIds[idx],
        };
      });

      const newPurchase = await tx.purchase.create({
        data: {
          supplierId,
          businessId: businessId!,
          invoiceNumber,
          notes,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          subtotal,
          taxAmount,
          total: subtotal + taxAmount,
          paymentMethod: pay.paymentMethod as any,
          paymentAccountId: pay.paymentAccountId,
          paidAmount: pay.paidAmount,
          paymentDetails: (pay.paymentDetails ?? undefined) as any,
          details: { create: details },
          // Valor de referencia/compat: la bodega de la primera línea. No se
          // lee en ningún otro lado del backend — solo sirve de fallback
          // legado para compras hechas antes de que existiera bodega por línea.
          branchId: itemBranchIds[0],
        },
      });

      // Costo ponderado por producto — costPrice es un campo global del producto,
      // no por bodega/línea; si la misma compra trae 2+ líneas del mismo producto
      // (repartido entre bodegas, o distintos lotes a distinto costo), el costo
      // final no debe depender del ORDEN en que se procesan las líneas (antes
      // ganaba la última línea sin ningún criterio de negocio).
      const weightedCostByProduct = new Map<string, number>();
      {
        const acc = new Map<string, { qty: number; costWeighted: number }>();
        for (const item of items) {
          const q = parseFloat(item.quantity);
          const c = parseFloat(item.unitCost);
          const a = acc.get(item.productId) || { qty: 0, costWeighted: 0 };
          a.qty += q; a.costWeighted += q * c;
          acc.set(item.productId, a);
        }
        for (const [pid, a] of acc) weightedCostByProduct.set(pid, a.qty > 0 ? a.costWeighted / a.qty : 0);
      }

      interface PurchaseProductRow { id: string; stock: number; minStock: number; lowStockNotifiedAt: Date | null; }
      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx];
        const lineBranchId = itemBranchIds[idx];
        // Lock row — provides accurate previousStock for the movement log
        const [locked] = await tx.$queryRawUnsafe<PurchaseProductRow[]>(
          'SELECT id, stock, "minStock", "lowStockNotifiedAt" FROM products WHERE id::text = $1 FOR UPDATE',
          item.productId,
        );
        if (!locked) continue;
        const qty = parseFloat(item.quantity);
        const newStock = locked.stock + qty;
        // Reabastecer por encima del mínimo limpia la marca de "ya notificado".
        const restocked = newStock > locked.minStock && !!locked.lowStockNotifiedAt;
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { increment: qty }, costPrice: weightedCostByProduct.get(item.productId)!,
            ...(restocked ? { lowStockNotifiedAt: null } : {}),
          },
        });
        // Bloquea (o crea en 0) la fila de stock de la bodega de ESTA línea e
        // incrementa — mismo patrón INSERT ... ON CONFLICT que sale.controller.ts.
        await tx.$executeRawUnsafe(
          `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, now(), now())
           ON CONFLICT ("productId", "branchId") DO UPDATE SET stock = product_stocks.stock + $4, "updatedAt" = now()`,
          randomUUID(), item.productId, lineBranchId, qty,
        );
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId, type: 'IN',
            quantity: qty,
            previousStock: locked.stock, newStock,
            reason: 'Compra',
            referenceId: newPurchase.id, referenceType: 'PURCHASE',
            unitCost: parseFloat(item.unitCost),
            totalCost: parseFloat(item.unitCost) * qty,
            branchId: lineBranchId,
          },
        });
      }

      // Parte a crédito: queda debiendo al proveedor. Crea la cuenta por pagar y
      // sube su deuda (espejo del fiado de cliente, dentro de la misma tx).
      if (pay.creditAmount > 0) {
        await tx.supplierCredit.create({
          data: {
            purchaseId: newPurchase.id, supplierId, businessId: businessId!,
            totalAmount: pay.creditAmount, paidAmount: 0, balance: pay.creditAmount,
            status: 'PENDING', dueDate: pay.creditDueDate,
          },
        });
        await tx.supplier.update({ where: { id: supplierId }, data: { currentDebt: { increment: pay.creditAmount } } });
      }

      return newPurchase;
    });

    // Registrar egreso en caja abierta cuando se paga en efectivo (best effort,
    // mismo patrón que expense.controller.ts) — la caja a afectar es la del
    // usuario que registra la compra, no la(s) bodega(s) donde entra la
    // mercancía: son dos cosas distintas, igual que ya pasa en Gastos.
    // Solo la PORCIÓN en efectivo sale de la caja (en pago dividido puede ser una
    // parte del total; el resto —transferencia/crédito— no toca la caja física).
    if (pay.cashAmount > 0) {
      try {
        const userBranchId = req.user!.branchId;
        if (userBranchId) {
          const openRegister = await prisma.cashRegister.findFirst({ where: { branchId: userBranchId, status: 'OPEN' } });
          if (openRegister) {
            await prisma.cashMovement.create({
              data: {
                cashRegisterId: openRegister.id,
                type: 'OUT',
                amount: pay.cashAmount,
                description: sup?.name ? `Compra a ${sup.name}` : 'Compra de mercancía',
                referenceId: purchase.id,
                createdById: req.user!.userId,
              },
            });
          }
        }
      } catch { /* no debe fallar el registro de la compra */ }
    }

    await cache.del(`dashboard:${businessId}`).catch(() => {});
    return created(res, purchase, 'Compra registrada');
  } catch (err) { next(err); }
});

router.put('/:id', requirePermission('compras.gestionar'), purchaseItemValidators, validate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { supplierId, invoiceNumber, items, notes, purchaseDate, paymentMethod, paymentAccountId } = req.body;
    if (!items?.length) throw new AppError('Se requieren productos', 400);
    const businessId = req.user!.businessId;
    let resolvedMethod = paymentMethod;
    let resolvedAccountId: string | null | undefined = undefined;
    if (paymentAccountId !== undefined) {
      const pay = await resolvePayment({ paymentAccountId, paymentMethod }, businessId!);
      resolvedMethod = pay.paymentMethod;
      resolvedAccountId = pay.paymentAccountId;
    }

    const existing = await prisma.purchase.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId },
      include: { details: true, supplierCredit: true },
    });
    if (!existing) throw new AppError('Compra no encontrada', 404);

    // Editar una compra con saldo a crédito reconciliaría deuda del proveedor +
    // caja + abonos: se prefiere anularla y volver a registrarla (evita descuadres).
    if (existing.supplierCredit && existing.supplierCredit.status !== 'CANCELLED') {
      throw new AppError('Esta compra tiene un saldo a crédito con el proveedor. Anúlala y regístrala de nuevo para cambiar el pago.', 400);
    }

    // Validate new items' products belong to this business (dedupe — ver nota
    // equivalente en POST sobre por qué hace falta con bodega por línea).
    const newProductIds: string[] = [...new Set<string>(items.map((item: any) => item.productId))];
    const validCount = await prisma.product.count({
      where: { id: { in: newProductIds }, businessId, deletedAt: null },
    });
    if (validCount !== newProductIds.length) {
      throw new AppError('Uno o más productos no pertenecen a este negocio', 403);
    }

    if (supplierId) {
      const sup = await prisma.supplier.findFirst({ where: { id: supplierId, businessId, deletedAt: null } });
      if (!sup) throw new AppError('Proveedor inválido', 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Fallback para detalles viejos sin branchId propio (compras de antes de
      // que existiera bodega por línea): se asume la bodega guardada en
      // Purchase.branchId, o la más antigua del negocio si tampoco existe.
      const legacyBranchId = await resolvePurchaseBranchId(tx, businessId!, existing.branchId);

      // Cada línea nueva declara su propia bodega; si no trae una, cae a
      // legacyBranchId y de ahí a la guardia de resolveEffectiveBranchId
      // (bodega fija del usuario / bodega del negocio) — validación por línea.
      const newItemsWithBranch = await Promise.all(
        items.map(async (item: any) => ({
          ...item,
          effectiveBranchId: await resolveEffectiveBranchId(tx, req, item.branchId || legacyBranchId),
        })),
      );

      // Clave compuesta productId+bodega: el mismo producto puede tener líneas
      // en bodegas distintas dentro de la misma compra. Cambiar la bodega de
      // una línea existente sale solo de este esquema: la clave vieja
      // (producto, bodega vieja) queda sin newItems → revierte todo; la clave
      // nueva (producto, bodega nueva) aparece sin oldRows → aplica todo.
      // Cantidad neta por clave: la línea vieja resta, la nueva suma, y se
      // aplica un solo ajuste de stock — en vez de "revertir todo lo viejo
      // (con un tope que perdía unidades ya vendidas) y luego reaplicar todo
      // lo nuevo", que en ese caso inflaba el stock (10→20 con 8 ya vendidas
      // terminaba en 20 en vez de los 12 correctos).
      const keyOf = (productId: string, branchId: string) => `${productId}::${branchId}`;

      // Se agrupa en ARREGLOS por clave (no un valor único) — si el usuario
      // repite el mismo producto+bodega en 2+ líneas (ej. mismo lote repartido,
      // o distintos costos), un Map de valor único se quedaba solo con la
      // ÚLTIMA línea y perdía en silencio la cantidad de las demás, descuadrando
      // el stock aunque el total mostrado en pantalla fuera el correcto.
      const oldDetailsByKey = new Map<string, typeof existing.details>();
      for (const d of existing.details) {
        const key = keyOf(d.productId, d.branchId || legacyBranchId);
        const arr = oldDetailsByKey.get(key);
        if (arr) arr.push(d); else oldDetailsByKey.set(key, [d]);
      }
      const newItemsByKey = new Map<string, any[]>();
      for (const item of newItemsWithBranch) {
        const key = keyOf(item.productId, item.effectiveBranchId);
        const arr = newItemsByKey.get(key);
        if (arr) arr.push(item); else newItemsByKey.set(key, [item]);
      }
      const keys = new Set<string>([...oldDetailsByKey.keys(), ...newItemsByKey.keys()]);

      function sumQty(rows: Array<{ quantity: any }>): number {
        return rows.reduce((sum, r) => sum + Number(r.quantity), 0);
      }
      function weightedAvgCost(rows: Array<{ quantity: any; unitCost: any }>): number {
        let qty = 0; let costWeighted = 0;
        for (const r of rows) { const q = Number(r.quantity); qty += q; costWeighted += q * Number(r.unitCost); }
        return qty > 0 ? costWeighted / qty : 0;
      }
      // Costo ponderado por producto (no por bodega) — costPrice es un campo
      // global del producto; se calcula UNA vez sobre TODAS las líneas nuevas de
      // ese producto (aunque estén repartidas en varias claves/bodegas), para que
      // el resultado sea el mismo sin importar en qué orden se procesen las claves.
      const weightedCostByProduct = new Map<string, number>();
      {
        const acc = new Map<string, { qty: number; costWeighted: number }>();
        for (const item of newItemsWithBranch) {
          const q = parseFloat(item.quantity);
          const c = parseFloat(item.unitCost);
          const a = acc.get(item.productId) || { qty: 0, costWeighted: 0 };
          a.qty += q; a.costWeighted += q * c;
          acc.set(item.productId, a);
        }
        for (const [pid, a] of acc) weightedCostByProduct.set(pid, a.qty > 0 ? a.costWeighted / a.qty : 0);
      }

      interface ProductRow { id: string; stock: number; allowNegativeStock: boolean; name: string; minStock: number; lowStockNotifiedAt: Date | null; }
      for (const key of keys) {
        const oldRows = oldDetailsByKey.get(key);
        const newRows = newItemsByKey.get(key);
        const productId = (oldRows ? oldRows[0].productId : newRows![0].productId) as string;
        const lineBranchId = (oldRows ? (oldRows[0].branchId || legacyBranchId) : newRows![0].effectiveBranchId) as string;
        const oldQty = oldRows ? sumQty(oldRows) : 0;
        const newQty = newRows ? sumQty(newRows) : 0;
        const delta = newQty - oldQty;

        const [locked] = await tx.$queryRawUnsafe<ProductRow[]>(
          'SELECT id, stock, "allowNegativeStock", name, "minStock", "lowStockNotifiedAt" FROM products WHERE id::text = $1 FOR UPDATE',
          productId,
        );
        if (!locked) continue;

        if (delta !== 0) {
          const newStock = locked.stock + delta;
          // El chequeo mira la bodega de ESTA línea, no solo el total — una
          // bodega concreta podría quedar en negativo aunque el total aguante.
          const [branchStockRow] = await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 0, now(), now())
             ON CONFLICT ("productId", "branchId") DO UPDATE SET "updatedAt" = product_stocks."updatedAt"
             RETURNING stock`,
            randomUUID(), productId, lineBranchId,
          );
          const newBranchStock = Number(branchStockRow.stock) + delta;
          if ((newStock < 0 || newBranchStock < 0) && !locked.allowNegativeStock) {
            throw new AppError(
              `No se puede editar la compra: ya se vendieron más unidades de "${locked.name}" de las que quedarían tras el ajuste`,
              400,
            );
          }
          const unitCost = newRows ? weightedCostByProduct.get(productId)! : weightedAvgCost(oldRows!);
          // Reabastecer por encima del mínimo limpia la marca de "ya notificado".
          const restocked = newStock > locked.minStock && !!locked.lowStockNotifiedAt;
          await tx.product.update({
            where: { id: productId },
            data: {
              stock: { increment: delta }, ...(newRows ? { costPrice: unitCost } : {}),
              ...(restocked ? { lowStockNotifiedAt: null } : {}),
            },
          });
          await tx.productStock.update({
            where: { productId_branchId: { productId, branchId: lineBranchId } },
            data: { stock: { increment: delta } },
          });
          await tx.inventoryMovement.create({
            data: {
              productId, type: delta > 0 ? 'IN' : 'OUT',
              quantity: Math.abs(delta),
              previousStock: locked.stock, newStock,
              reason: 'Edición de compra',
              referenceId: req.params.id, referenceType: 'PURCHASE',
              unitCost,
              totalCost: Math.abs(delta) * unitCost,
              branchId: lineBranchId,
            },
          });
        } else if (newRows) {
          // Misma cantidad, pero el costo unitario pudo haber cambiado — se conserva
          // el costo ponderado aunque el delta de stock haya quedado en cero.
          await tx.product.update({ where: { id: productId }, data: { costPrice: weightedCostByProduct.get(productId)! } });
        }
      }

      await tx.purchaseDetail.deleteMany({ where: { purchaseId: req.params.id } });

      let subtotal = 0;
      let taxAmount = 0;
      const details = newItemsWithBranch.map((item: any) => {
        const lineSub = parseFloat(item.unitCost) * parseFloat(item.quantity);
        const lineTax = lineSub * ((parseFloat(item.taxRate) || 0) / 100);
        subtotal += lineSub;
        taxAmount += lineTax;
        return {
          productId: item.productId,
          quantity: parseFloat(item.quantity),
          unitCost: parseFloat(item.unitCost),
          taxRate: parseFloat(item.taxRate) || 0,
          subtotal: lineSub,
          total: lineSub + lineTax,
          branchId: item.effectiveBranchId,
        };
      });

      const updatedPurchase = await tx.purchase.update({
        where: { id: req.params.id },
        data: {
          supplierId, invoiceNumber, notes, paymentMethod: resolvedMethod, paymentAccountId: resolvedAccountId,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : existing.purchaseDate,
          subtotal, taxAmount, total: subtotal + taxAmount,
          details: { create: details },
          // Se mantiene alineado con la primera línea, igual que en POST.
          branchId: newItemsWithBranch[0]?.effectiveBranchId ?? existing.branchId,
        },
      });

      return updatedPurchase;
    });

    // Reconciliar el movimiento de caja que esta compra generó al crearse —
    // mismo patrón que expenseController.update. Solo se ajusta si la caja
    // donde se registró sigue abierta; una vez cerrada, ese cierre ya quedó
    // conciliado y no se debe alterar en retrospectiva.
    try {
      const movement = await prisma.cashMovement.findFirst({
        where: { referenceId: existing.id, type: 'OUT' },
        include: { cashRegister: true },
      });
      const newPaymentMethod = resolvedMethod !== undefined ? resolvedMethod : existing.paymentMethod;
      const newAmount = Number(updated.total);

      if (movement && movement.cashRegister.status === 'OPEN') {
        if (newPaymentMethod !== 'CASH') {
          await prisma.cashMovement.delete({ where: { id: movement.id } });
        } else {
          await prisma.cashMovement.update({ where: { id: movement.id }, data: { amount: newAmount } });
        }
      } else if (!movement && existing.paymentMethod !== 'CASH' && newPaymentMethod === 'CASH') {
        const userBranchId = req.user!.branchId;
        if (userBranchId) {
          const openRegister = await prisma.cashRegister.findFirst({ where: { branchId: userBranchId, status: 'OPEN' } });
          if (openRegister) {
            await prisma.cashMovement.create({
              data: {
                cashRegisterId: openRegister.id,
                type: 'OUT',
                amount: newAmount,
                description: 'Compra de mercancía',
                referenceId: existing.id,
                createdById: req.user!.userId,
              },
            });
          }
        }
      }
    } catch { /* no debe fallar la actualización de la compra */ }

    await cache.del(`dashboard:${businessId}`).catch(() => {});
    return success(res, updated, 'Compra actualizada');
  } catch (err) { next(err); }
});

router.delete('/:id', requirePermission('compras.eliminar'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.purchase.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
      include: { details: true, supplierCredit: true },
    });
    if (!existing) throw new AppError('Compra no encontrada', 404);

    await prisma.$transaction(async (tx) => {
      // Fallback solo para detalles legados sin branchId propio.
      const legacyBranchId = await resolvePurchaseBranchId(tx, req.user!.businessId!, existing.branchId);

      // Si la compra dejó un saldo a crédito con el proveedor, se anula y se baja
      // su deuda por el SALDO pendiente (los abonos ya hechos son reales y quedan).
      if (existing.supplierCredit && existing.supplierCredit.status !== 'CANCELLED') {
        const bal = Number(existing.supplierCredit.balance);
        if (bal > 0) {
          await tx.supplier.update({ where: { id: existing.supplierId }, data: { currentDebt: { decrement: bal } } });
        }
        await tx.supplierCredit.update({ where: { id: existing.supplierCredit.id }, data: { status: 'CANCELLED', balance: 0 } });
      }

      interface DeleteProductRow { id: string; stock: number; allowNegativeStock: boolean; name: string; }
      for (const detail of existing.details) {
        const lineBranchId = detail.branchId || legacyBranchId;
        // Lock row — provides accurate previousStock/newStock; use atomic decrement
        // instead of the previous `stock: Math.max(0, staleValue - qty)` which:
        //   1. used a stale read susceptible to concurrent updates
        //   2. silently capped at 0, hiding real inventory discrepancies
        const [locked] = await tx.$queryRawUnsafe<DeleteProductRow[]>(
          'SELECT id, stock, "allowNegativeStock", name FROM products WHERE id::text = $1 FOR UPDATE',
          detail.productId,
        );
        if (!locked) continue;
        const newStock = locked.stock - detail.quantity;
        // El chequeo mira la bodega de ESTA línea, no solo el total.
        const [branchStockRow] = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 0, now(), now())
           ON CONFLICT ("productId", "branchId") DO UPDATE SET "updatedAt" = product_stocks."updatedAt"
           RETURNING stock`,
          randomUUID(), detail.productId, lineBranchId,
        );
        const newBranchStock = Number(branchStockRow.stock) - detail.quantity;
        // A diferencia de la versión anterior, que descontaba sin tope: si ya se
        // vendieron unidades de esta compra y el producto no permite stock
        // negativo, no se debe poder eliminarla sin dejar el inventario en negativo.
        if ((newStock < 0 || newBranchStock < 0) && !locked.allowNegativeStock) {
          throw new AppError(
            `No se puede eliminar la compra: ya se vendieron unidades de "${locked.name}" que quedarían en stock negativo`,
            400,
          );
        }
        await tx.product.update({
          where: { id: detail.productId },
          data: { stock: { decrement: detail.quantity } },
        });
        await tx.productStock.update({
          where: { productId_branchId: { productId: detail.productId, branchId: lineBranchId } },
          data: { stock: { decrement: detail.quantity } },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: detail.productId, type: 'OUT',
            quantity: detail.quantity,
            previousStock: locked.stock, newStock,
            reason: 'Anulación de compra',
            referenceId: req.params.id, referenceType: 'PURCHASE',
            unitCost: Number(detail.unitCost),
            totalCost: Number(detail.unitCost) * detail.quantity,
            branchId: lineBranchId,
          },
        });
      }
      await tx.purchase.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    });

    // Igual que en expenseController.delete: si la caja donde se registró el
    // egreso sigue abierta, se elimina también — de lo contrario queda una
    // salida de caja "huérfana" que ya no corresponde a ninguna compra real.
    try {
      const movement = await prisma.cashMovement.findFirst({
        where: { referenceId: existing.id, type: 'OUT' },
        include: { cashRegister: true },
      });
      if (movement && movement.cashRegister.status === 'OPEN') {
        await prisma.cashMovement.delete({ where: { id: movement.id } });
      }
    } catch { /* no debe fallar la eliminación de la compra */ }

    await cache.del(`dashboard:${req.user!.businessId}`).catch(() => {});
    return success(res, null, 'Compra eliminada y stock revertido');
  } catch (err) { next(err); }
});

export default router;
