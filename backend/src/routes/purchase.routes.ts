import { Router, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { success, created, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AppError } from '../utils/response';
import { validate } from '../middlewares/validate';
import { resolveEffectiveBranchId } from '../utils/resolveBranch';

const purchaseItemValidators = [
  body('items').isArray({ min: 1 }).withMessage('Se requieren productos'),
  body('items.*.productId').isUUID().withMessage('productId inválido'),
  body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Cantidad debe ser mayor a 0'),
  body('items.*.unitCost').isFloat({ min: 0 }).withMessage('Costo unitario inválido'),
  body('items.*.taxRate').optional().isFloat({ min: 0, max: 100 }).withMessage('IVA inválido'),
  body('branchId').optional().isUUID().withMessage('branchId inválido'),
  body('invoiceNumber').optional().trim(),
  body('notes').optional().trim(),
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
    const { supplierId, invoiceNumber, items, notes, purchaseDate, branchId } = req.body;
    if (!items?.length) throw new AppError('Se requieren productos', 400);
    const businessId = req.user!.businessId;

    // Validate all products belong to this business before starting the transaction
    const productIds: string[] = items.map((item: any) => item.productId);
    const validCount = await prisma.product.count({
      where: { id: { in: productIds }, businessId, deletedAt: null },
    });
    if (validCount !== productIds.length) {
      throw new AppError('Uno o más productos no pertenecen a este negocio', 403);
    }

    if (supplierId) {
      const sup = await prisma.supplier.findFirst({ where: { id: supplierId, businessId, deletedAt: null } });
      if (!sup) throw new AppError('Proveedor inválido', 400);
    }

    const effectiveBranchId = await resolveEffectiveBranchId(prisma, req, branchId);

    const purchase = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let taxAmount = 0;

      const details = items.map((item: any) => {
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
          details: { create: details },
          branchId: effectiveBranchId,
        },
      });

      interface PurchaseProductRow { id: string; stock: number; minStock: number; lowStockNotifiedAt: Date | null; }
      for (const item of items) {
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
        // Bloquea (o crea en 0) la fila de stock de la bodega que recibe la
        // compra e incrementa — mismo patrón INSERT ... ON CONFLICT que sale.controller.ts.
        await tx.$executeRawUnsafe(
          `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, now(), now())
           ON CONFLICT ("productId", "branchId") DO UPDATE SET stock = product_stocks.stock + $4, "updatedAt" = now()`,
          randomUUID(), item.productId, effectiveBranchId, qty,
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
            branchId: effectiveBranchId,
          },
        });
      }
      return newPurchase;
    });

    return created(res, purchase, 'Compra registrada');
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'), purchaseItemValidators, validate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { supplierId, invoiceNumber, items, notes, purchaseDate } = req.body;
    if (!items?.length) throw new AppError('Se requieren productos', 400);
    const businessId = req.user!.businessId;

    const existing = await prisma.purchase.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId },
      include: { details: true },
    });
    if (!existing) throw new AppError('Compra no encontrada', 404);

    // Validate new items' products belong to this business
    const newProductIds: string[] = items.map((item: any) => item.productId);
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
      // La compra no cambia de bodega al editarse — se usa la misma que se
      // guardó al crearla (o la más antigua del negocio, si es de antes de esta función).
      const purchaseBranchId = await resolvePurchaseBranchId(tx, businessId!, existing.branchId);

      // Cantidad neta por producto: la línea vieja resta, la línea nueva suma, y se
      // aplica un solo ajuste de stock por producto — en vez de "revertir todo lo
      // viejo (con un tope que perdía unidades ya vendidas) y luego reaplicar todo
      // lo nuevo", que en ese caso inflaba el stock (10→20 con 8 ya vendidas
      // terminaba en 20 en vez de los 12 correctos).
      const oldDetailByProduct = new Map(existing.details.map((d) => [d.productId, d]));
      const newItemByProduct = new Map<string, any>(items.map((i: any) => [i.productId, i]));
      const productIds = new Set<string>([...oldDetailByProduct.keys(), ...newItemByProduct.keys()]);

      interface ProductRow { id: string; stock: number; allowNegativeStock: boolean; name: string; minStock: number; lowStockNotifiedAt: Date | null; }
      for (const productId of productIds) {
        const oldDetail = oldDetailByProduct.get(productId);
        const newItem: any = newItemByProduct.get(productId);
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
          // El chequeo mira la bodega de la compra, no solo el total — una
          // bodega concreta podría quedar en negativo aunque el total aguante.
          const [branchStockRow] = await tx.$queryRawUnsafe<any[]>(
            `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
             VALUES ($1, $2, $3, 0, now(), now())
             ON CONFLICT ("productId", "branchId") DO UPDATE SET "updatedAt" = product_stocks."updatedAt"
             RETURNING stock`,
            randomUUID(), productId, purchaseBranchId,
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
            where: { productId_branchId: { productId, branchId: purchaseBranchId } },
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
              branchId: purchaseBranchId,
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
      const details = items.map((item: any) => {
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
        };
      });

      const updatedPurchase = await tx.purchase.update({
        where: { id: req.params.id },
        data: {
          supplierId, invoiceNumber, notes,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : existing.purchaseDate,
          subtotal, taxAmount, total: subtotal + taxAmount,
          details: { create: details },
        },
      });

      return updatedPurchase;
    });

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
      const purchaseBranchId = await resolvePurchaseBranchId(tx, req.user!.businessId!, existing.branchId);

      interface DeleteProductRow { id: string; stock: number; allowNegativeStock: boolean; name: string; }
      for (const detail of existing.details) {
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
        // El chequeo mira la bodega de la compra, no solo el total.
        const [branchStockRow] = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 0, now(), now())
           ON CONFLICT ("productId", "branchId") DO UPDATE SET "updatedAt" = product_stocks."updatedAt"
           RETURNING stock`,
          randomUUID(), detail.productId, purchaseBranchId,
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
          where: { productId_branchId: { productId: detail.productId, branchId: purchaseBranchId } },
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
            branchId: purchaseBranchId,
          },
        });
      }
      await tx.purchase.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    });

    return success(res, null, 'Compra eliminada y stock revertido');
  } catch (err) { next(err); }
});

export default router;
