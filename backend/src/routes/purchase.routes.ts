import { Router, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { resolveEffectiveBranchId } from '../utils/resolveBranch';
import { success, created, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AppError } from '../utils/response';
import { validate } from '../middlewares/validate';

const purchaseItemValidators = [
  body('items').isArray({ min: 1 }).withMessage('Se requieren productos'),
  body('items.*.productId').isUUID().withMessage('productId inválido'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Cantidad debe ser mayor a 0'),
  body('items.*.unitCost').isFloat({ min: 0 }).withMessage('Costo unitario inválido'),
  body('items.*.taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('IVA inválido'),
  body('items.*.branchId').optional({ nullable: true }).isUUID().withMessage('branchId de línea inválido'),
  body('branchId').optional().isUUID().withMessage('branchId inválido'),
  body('invoiceNumber').optional().trim(),
  body('notes').optional().trim(),
  // MIXED no se ofrece aquí — mismo criterio que el <select> de Gastos.
  body('paymentMethod').optional().isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD']).withMessage('Método de pago inválido'),
];

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

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const businessId = req.user!.businessId;
    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where: { deletedAt: null, businessId },
        skip, take: limit, orderBy: { purchaseDate: 'desc' },
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { details: true } },
        },
      }),
      prisma.purchase.count({ where: { deletedAt: null, businessId } }),
    ]);
    return paginated(res, purchases, total, page, limit);
  } catch (err) { next(err); }
});

// Debe ir antes de "/:id" — si no, Express la interpreta como un id.
router.get('/check-invoice', async (req: AuthRequest, res, next) => {
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

router.get('/:id', async (req: AuthRequest, res, next) => {
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
router.post('/', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE', 'CASHIER'), purchaseItemValidators, validate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { supplierId, invoiceNumber, items, notes, purchaseDate, branchId, paymentMethod } = req.body;
    if (!items?.length) throw new AppError('Se requieren productos', 400);
    const businessId = req.user!.businessId;
    const effectivePaymentMethod = paymentMethod || 'CASH';

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
          businessId,
          invoiceNumber,
          notes,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : new Date(),
          subtotal,
          taxAmount,
          total: subtotal + taxAmount,
          paymentMethod: effectivePaymentMethod,
          details: { create: details },
          // Valor de referencia/compat: la bodega de la primera línea. No se
          // lee en ningún otro lado del backend — solo sirve de fallback
          // legado para compras hechas antes de que existiera bodega por línea.
          branchId: itemBranchIds[0],
        },
      });

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
            stock: { increment: qty }, costPrice: parseFloat(item.unitCost),
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
      return newPurchase;
    });

    // Registrar egreso en caja abierta cuando se paga en efectivo (best effort,
    // mismo patrón que expense.controller.ts) — la caja a afectar es la del
    // usuario que registra la compra, no la(s) bodega(s) donde entra la
    // mercancía: son dos cosas distintas, igual que ya pasa en Gastos.
    if (effectivePaymentMethod === 'CASH') {
      try {
        const userBranchId = req.user!.branchId;
        if (userBranchId) {
          const openRegister = await prisma.cashRegister.findFirst({ where: { branchId: userBranchId, status: 'OPEN' } });
          if (openRegister) {
            await prisma.cashMovement.create({
              data: {
                cashRegisterId: openRegister.id,
                type: 'OUT',
                amount: Number(purchase.total),
                description: sup?.name ? `Compra a ${sup.name}` : 'Compra de mercancía',
                referenceId: purchase.id,
              },
            });
          }
        }
      } catch { /* no debe fallar el registro de la compra */ }
    }

    return created(res, purchase, 'Compra registrada');
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'), purchaseItemValidators, validate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { supplierId, invoiceNumber, items, notes, purchaseDate, paymentMethod } = req.body;
    if (!items?.length) throw new AppError('Se requieren productos', 400);
    const businessId = req.user!.businessId;

    const existing = await prisma.purchase.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId },
      include: { details: true },
    });
    if (!existing) throw new AppError('Compra no encontrada', 404);

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
      // (producto, bodega vieja) queda sin newItem → revierte todo; la clave
      // nueva (producto, bodega nueva) aparece sin oldDetail → aplica todo.
      // Cantidad neta por clave: la línea vieja resta, la nueva suma, y se
      // aplica un solo ajuste de stock — en vez de "revertir todo lo viejo
      // (con un tope que perdía unidades ya vendidas) y luego reaplicar todo
      // lo nuevo", que en ese caso inflaba el stock (10→20 con 8 ya vendidas
      // terminaba en 20 en vez de los 12 correctos).
      const keyOf = (productId: string, branchId: string) => `${productId}::${branchId}`;
      const oldDetailByKey = new Map(
        existing.details.map((d) => [keyOf(d.productId, d.branchId || legacyBranchId), d]),
      );
      const newItemByKey = new Map<string, any>(
        newItemsWithBranch.map((i: any) => [keyOf(i.productId, i.effectiveBranchId), i]),
      );
      const keys = new Set<string>([...oldDetailByKey.keys(), ...newItemByKey.keys()]);

      interface ProductRow { id: string; stock: number; allowNegativeStock: boolean; name: string; minStock: number; lowStockNotifiedAt: Date | null; }
      for (const key of keys) {
        const oldDetail = oldDetailByKey.get(key);
        const newItem: any = newItemByKey.get(key);
        const productId = (oldDetail?.productId ?? newItem.productId) as string;
        const lineBranchId = (oldDetail ? (oldDetail.branchId || legacyBranchId) : newItem.effectiveBranchId) as string;
        const oldQty = oldDetail ? Number(oldDetail.quantity) : 0;
        const newQty = newItem ? parseFloat(newItem.quantity) : 0;
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
          const unitCost = newItem ? parseFloat(newItem.unitCost) : Number(oldDetail!.unitCost);
          // Reabastecer por encima del mínimo limpia la marca de "ya notificado".
          const restocked = newStock > locked.minStock && !!locked.lowStockNotifiedAt;
          await tx.product.update({
            where: { id: productId },
            data: {
              stock: { increment: delta }, ...(newItem ? { costPrice: unitCost } : {}),
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
        } else if (newItem) {
          // Misma cantidad, pero el costo unitario pudo haber cambiado — se conserva
          // el "último costo" aunque el delta de stock haya quedado en cero.
          await tx.product.update({ where: { id: productId }, data: { costPrice: parseFloat(newItem.unitCost) } });
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
          supplierId, invoiceNumber, notes, paymentMethod,
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
      const newPaymentMethod = paymentMethod !== undefined ? paymentMethod : existing.paymentMethod;
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
              },
            });
          }
        }
      }
    } catch { /* no debe fallar la actualización de la compra */ }

    return success(res, updated, 'Compra actualizada');
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN', 'SUPERVISOR'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.purchase.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
      include: { details: true },
    });
    if (!existing) throw new AppError('Compra no encontrada', 404);

    await prisma.$transaction(async (tx) => {
      // Fallback solo para detalles legados sin branchId propio.
      const legacyBranchId = await resolvePurchaseBranchId(tx, req.user!.businessId!, existing.branchId);

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

    return success(res, null, 'Compra eliminada y stock revertido');
  } catch (err) { next(err); }
});

export default router;
