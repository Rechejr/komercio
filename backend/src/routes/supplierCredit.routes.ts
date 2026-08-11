import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { authenticate, authorize } from '../middlewares/auth';
import { success, paginated, AppError } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { validate } from '../middlewares/validate';
import { resolvePayment } from '../utils/paymentAccount';
import { parseBogotaBoundary } from '../utils/bogotaTime';

// Cuentas por pagar: lo que el negocio le debe a sus proveedores por compras a
// crédito. Espejo de créditos/fiados de clientes, pero al ABONAR sale plata de
// la caja (pagar al proveedor), en vez de entrar.
const router = Router();
router.use(authenticate);

router.get('/', async (req: any, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { status, supplierId, startDate, endDate } = req.query;
    const businessId = req.user.businessId;

    const where: any = { deletedAt: null, businessId };
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    // Rango por día calendario colombiano sobre la fecha de creación.
    const gte = parseBogotaBoundary(startDate, 'start');
    const lte = parseBogotaBoundary(endDate, 'end');
    if (gte || lte) where.createdAt = { ...(gte && { gte }), ...(lte && { lte }) };

    const [rows, total] = await Promise.all([
      prisma.supplierCredit.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, phone: true, mobile: true } },
          purchase: { select: { invoiceNumber: true } },
          _count: { select: { payments: true } },
        },
      }),
      prisma.supplierCredit.count({ where }),
    ]);
    return paginated(res, rows, total, page, limit);
  } catch (err) { next(err); }
});

router.get('/:id', async (req: any, res, next) => {
  try {
    const credit = await prisma.supplierCredit.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId: req.user.businessId },
      include: {
        supplier: true,
        purchase: { select: { invoiceNumber: true, purchaseDate: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!credit) throw new AppError('Cuenta por pagar no encontrada', 404);
    return success(res, credit);
  } catch (err) { next(err); }
});

// Abonar a un proveedor: paga parte del saldo → SALE plata de la caja.
router.post('/:id/payments',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER'),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a 0'),
    body('paymentMethod').optional().isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD']),
    body('paymentAccountId').optional({ nullable: true }).isString(),
    body('notes').optional().trim(),
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, paymentAccountId, notes } = req.body;
      const paymentAmount = parseFloat(amount);
      if (!(paymentAmount > 0)) throw new AppError('El monto debe ser mayor a 0', 400);

      const businessId = req.user.businessId;
      const pay = await resolvePayment({ paymentAccountId, paymentMethod }, businessId);

      const [newBalance, newStatus, supplierName] = await prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<any[]>`
          SELECT id, "totalAmount", "paidAmount", balance, status, "supplierId"
          FROM supplier_credits
          WHERE id::text = ${id} AND "deletedAt" IS NULL AND "businessId" = ${businessId}
          FOR UPDATE
        `;
        if (!locked) throw new AppError('Cuenta por pagar no encontrada', 404);
        if (locked.status === 'PAID') throw new AppError('Esta cuenta ya está saldada', 400);
        if (locked.status === 'CANCELLED') throw new AppError('Esta cuenta está anulada', 400);

        const currentBalance = Number(locked.balance);
        if (paymentAmount > currentBalance + 1) throw new AppError('El pago supera el saldo pendiente', 400);

        const newPaid = Number(locked.paidAmount) + paymentAmount;
        const balance = Math.max(0, Number(locked.totalAmount) - newPaid);
        // Un abono parcial a una cuenta vencida no la pone al día (sigue OVERDUE
        // hasta saldar), igual que el fiado de cliente.
        const status = balance <= 0
          ? 'PAID'
          : locked.status === 'OVERDUE' ? 'OVERDUE' : (newPaid > 0 ? 'PARTIAL' : 'PENDING');

        await tx.supplierCreditPayment.create({
          data: { supplierCreditId: id, amount: paymentAmount, paymentMethod: pay.paymentMethod, paymentAccountId: pay.paymentAccountId, notes },
        });
        await tx.supplierCredit.update({ where: { id }, data: { paidAmount: newPaid, balance, status: status as any } });

        const supplier = await tx.supplier.findUnique({ where: { id: locked.supplierId }, select: { currentDebt: true, name: true } });
        const safeDecrement = Math.min(paymentAmount, Math.max(0, Number(supplier?.currentDebt ?? paymentAmount)));
        await tx.supplier.update({ where: { id: locked.supplierId }, data: { currentDebt: { decrement: safeDecrement } } });

        return [balance, status, supplier?.name] as const;
      });

      // Pagar al proveedor SACA plata de la caja (best-effort, no rompe el abono).
      if (pay.paymentMethod === 'CASH') {
        try {
          const branchId = req.user.branchId;
          if (branchId) {
            const openRegister = await prisma.cashRegister.findFirst({ where: { branchId, status: 'OPEN' } });
            if (openRegister) {
              await prisma.cashMovement.create({
                data: {
                  cashRegisterId: openRegister.id, type: 'OUT', amount: paymentAmount,
                  description: `Pago a proveedor${supplierName ? ` — ${supplierName}` : ''}`,
                  referenceId: id, createdById: req.user.userId,
                },
              });
            }
          }
        } catch { /* no debe fallar el abono */ }
      }

      await cache.del(`dashboard:${businessId}`).catch(() => {});
      return success(res, { newBalance, status: newStatus }, 'Pago registrado');
    } catch (err) { next(err); }
  },
);

export default router;
