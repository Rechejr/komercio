import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { success, created, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AppError } from '../utils/response';

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

router.post('/', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'), async (req: AuthRequest, res, next) => {
  try {
    const { supplierId, invoiceNumber, items, notes, purchaseDate } = req.body;
    if (!items?.length) throw new AppError('Se requieren productos', 400);
    const businessId = req.user!.businessId;

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

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product) {
          const qty = parseFloat(item.quantity);
          const newStock = product.stock + qty;
          await tx.product.update({ where: { id: product.id }, data: { stock: { increment: qty }, costPrice: parseFloat(item.unitCost) } });
          await tx.inventoryMovement.create({
            data: {
              productId: product.id, type: 'IN',
              quantity: qty,
              previousStock: product.stock, newStock,
              reason: 'Compra',
              referenceId: newPurchase.id, referenceType: 'PURCHASE',
            },
          });
        }
      }
      return newPurchase;
    });

    return created(res, purchase, 'Compra registrada');
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'), async (req: AuthRequest, res, next) => {
  try {
    const { supplierId, invoiceNumber, items, notes, purchaseDate } = req.body;
    if (!items?.length) throw new AppError('Se requieren productos', 400);

    const existing = await prisma.purchase.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
      include: { details: true },
    });
    if (!existing) throw new AppError('Compra no encontrada', 404);

    const updated = await prisma.$transaction(async (tx) => {
      for (const old of existing.details) {
        const product = await tx.product.findUnique({ where: { id: old.productId } });
        if (product && product.stock >= old.quantity) {
          await tx.product.update({ where: { id: product.id }, data: { stock: { decrement: old.quantity } } });
        } else if (product) {
          await tx.product.update({ where: { id: product.id }, data: { stock: 0 } });
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

      for (const item of items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (product) {
          const qty = parseFloat(item.quantity);
          const newStock = product.stock + qty;
          await tx.product.update({ where: { id: product.id }, data: { stock: { increment: qty }, costPrice: parseFloat(item.unitCost) } });
          await tx.inventoryMovement.create({
            data: {
              productId: product.id, type: 'IN',
              quantity: qty,
              previousStock: product.stock, newStock,
              reason: 'Edición de compra',
              referenceId: req.params.id, referenceType: 'PURCHASE',
            },
          });
        }
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
      for (const detail of existing.details) {
        const product = await tx.product.findUnique({ where: { id: detail.productId } });
        if (product) {
          const restoredStock = Math.max(0, product.stock - detail.quantity);
          await tx.product.update({ where: { id: product.id }, data: { stock: restoredStock } });
          await tx.inventoryMovement.create({
            data: {
              productId: product.id, type: 'OUT',
              quantity: detail.quantity,
              previousStock: product.stock, newStock: restoredStock,
              reason: 'Anulación de compra',
              referenceId: req.params.id, referenceType: 'PURCHASE',
            },
          });
        }
      }
      await tx.purchase.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    });

    return success(res, null, 'Compra eliminada y stock revertido');
  } catch (err) { next(err); }
});

export default router;
