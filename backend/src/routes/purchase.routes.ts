import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
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
  body('invoiceNumber').optional().trim(),
  body('notes').optional().trim(),
];

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

router.post('/', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'), purchaseItemValidators, validate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { supplierId, invoiceNumber, items, notes, purchaseDate } = req.body;
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
        },
      });

      interface PurchaseProductRow { id: string; stock: number; }
      for (const item of items) {
        // Lock row — provides accurate previousStock for the movement log
        const [locked] = await tx.$queryRawUnsafe<PurchaseProductRow[]>(
          'SELECT id, stock FROM products WHERE id::text = $1 FOR UPDATE',
          item.productId,
        );
        if (!locked) continue;
        const qty = parseFloat(item.quantity);
        const newStock = locked.stock + qty;
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: qty }, costPrice: parseFloat(item.unitCost) },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId, type: 'IN',
            quantity: qty,
            previousStock: locked.stock, newStock,
            reason: 'Compra',
            referenceId: newPurchase.id, referenceType: 'PURCHASE',
            unitCost: parseFloat(item.unitCost),
            totalCost: parseFloat(item.unitCost) * qty,
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

    const existing = await prisma.purchase.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
      include: { details: true },
    });
    if (!existing) throw new AppError('Compra no encontrada', 404);

    // Validate new items' products belong to this business
    const newProductIds: string[] = items.map((item: any) => item.productId);
    const validCount = await prisma.product.count({
      where: { id: { in: newProductIds }, businessId: req.user!.businessId, deletedAt: null },
    });
    if (validCount !== newProductIds.length) {
      throw new AppError('Uno o más productos no pertenecen a este negocio', 403);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Revert stock from old details: lock each row and only decrement as much
      // stock as currently exists — prevents driving stock below 0 when units
      // were already sold since the original purchase was registered.
      interface RevertRow { id: string; stock: number; }
      for (const old of existing.details) {
        const [locked] = await tx.$queryRawUnsafe<RevertRow[]>(
          'SELECT id, stock FROM products WHERE id::text = $1 FOR UPDATE',
          old.productId,
        );
        if (!locked) continue;
        const revertQty = Math.min(Number(old.quantity), locked.stock);
        if (revertQty > 0) {
          await tx.product.update({
            where: { id: old.productId },
            data: { stock: { decrement: revertQty } },
          });
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

      interface PurchaseProductRow { id: string; stock: number; }
      for (const item of items) {
        // Lock row — provides accurate previousStock for the movement log
        const [locked] = await tx.$queryRawUnsafe<PurchaseProductRow[]>(
          'SELECT id, stock FROM products WHERE id::text = $1 FOR UPDATE',
          item.productId,
        );
        if (!locked) continue;
        const qty = parseFloat(item.quantity);
        const newStock = locked.stock + qty;
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: qty }, costPrice: parseFloat(item.unitCost) },
        });
        await tx.inventoryMovement.create({
          data: {
            productId: item.productId, type: 'IN',
            quantity: qty,
            previousStock: locked.stock, newStock,
            reason: 'Edición de compra',
            referenceId: req.params.id, referenceType: 'PURCHASE',
            unitCost: parseFloat(item.unitCost),
            totalCost: parseFloat(item.unitCost) * qty,
          },
        });
      }

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
      interface DeleteProductRow { id: string; stock: number; }
      for (const detail of existing.details) {
        // Lock row — provides accurate previousStock/newStock; use atomic decrement
        // instead of the previous `stock: Math.max(0, staleValue - qty)` which:
        //   1. used a stale read susceptible to concurrent updates
        //   2. silently capped at 0, hiding real inventory discrepancies
        const [locked] = await tx.$queryRawUnsafe<DeleteProductRow[]>(
          'SELECT id, stock FROM products WHERE id::text = $1 FOR UPDATE',
          detail.productId,
        );
        if (!locked) continue;
        const newStock = locked.stock - detail.quantity;
        await tx.product.update({
          where: { id: detail.productId },
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
          },
        });
      }
      await tx.purchase.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    });

    return success(res, null, 'Compra eliminada y stock revertido');
  } catch (err) { next(err); }
});

export default router;
