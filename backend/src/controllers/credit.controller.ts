import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';
import { emitToBusinesss, socketEvents } from '../config/socket';

export const creditController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const { status, customerId } = req.query;

      const businessId = req.user!.businessId;

      const where: any = { deletedAt: null, customer: { businessId } };
      if (status) where.status = status;
      if (customerId) where.customerId = customerId;

      const [credits, total] = await Promise.all([
        prisma.credit.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            customer: { select: { id: true, name: true, phone: true } },
            sale: { select: { invoiceNumber: true } },
            _count: { select: { payments: true } },
          },
        }),
        prisma.credit.count({ where }),
      ]);

      return paginated(res, credits, total, page, limit);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const credit = await prisma.credit.findFirst({
        where: { id: req.params.id, deletedAt: null, customer: { businessId: req.user!.businessId } },
        include: {
          customer: true,
          sale: { select: { invoiceNumber: true, details: { include: { product: { select: { name: true } } } } } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });
      if (!credit) throw new AppError('Crédito no encontrado', 404);
      return success(res, credit);
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { customerId, totalAmount, dueDate, notes } = req.body;

      const customer = await prisma.customer.findFirst({
        where: { id: customerId, businessId: req.user!.businessId, deletedAt: null },
      });
      if (!customer) throw new AppError('Cliente no encontrado', 404);

      const credit = await prisma.$transaction(async (tx) => {
        const newCredit = await tx.credit.create({
          data: {
            customerId,
            totalAmount: parseFloat(totalAmount),
            paidAmount: 0,
            balance: parseFloat(totalAmount),
            status: 'PENDING',
            dueDate: dueDate ? new Date(dueDate) : null,
            notes,
          },
        });

        await tx.customer.update({
          where: { id: customerId },
          data: { currentDebt: { increment: parseFloat(totalAmount) } },
        });

        return newCredit;
      });

      await cache.del(`dashboard:${req.user!.businessId}`).catch(() => {});
      return created(res, credit, 'Crédito registrado');
    } catch (err) {
      next(err);
    }
  },

  async addPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, notes } = req.body;

      const paymentAmount = parseFloat(amount);
      if (!paymentAmount || paymentAmount <= 0) throw new AppError('El monto debe ser mayor a 0', 400);

      const businessId = req.user!.businessId;

      const [newBalance, newStatus, customerName] = await prisma.$transaction(async (tx) => {
        // Lock the row to prevent concurrent payment race conditions
        const [locked] = await tx.$queryRaw<any[]>`
          SELECT c.id, c."totalAmount", c."paidAmount", c.balance, c.status, c."customerId"
          FROM credits c
          JOIN customers cu ON c."customerId" = cu.id
          WHERE c.id::text = ${id}
            AND c."deletedAt" IS NULL
            AND cu."businessId" = ${businessId}
          FOR UPDATE
        `;
        if (!locked) throw new AppError('Crédito no encontrado', 404);
        if (locked.status === 'PAID') throw new AppError('Este crédito ya está saldado', 400);

        const currentBalance = Number(locked.balance);
        if (paymentAmount > currentBalance) throw new AppError('El pago supera el saldo pendiente', 400);

        const newPaid = Number(locked.paidAmount) + paymentAmount;
        const balance = Number(locked.totalAmount) - newPaid;
        // Un abono parcial a un crédito ya vencido no lo "pone al día" — sigue
        // vencido hasta que se salde por completo; antes bajaba a PARTIAL y
        // desaparecía del filtro de vencidos hasta el próximo tick del cron horario.
        const status = balance <= 0
          ? 'PAID'
          : locked.status === 'OVERDUE'
            ? 'OVERDUE'
            : newPaid > 0 ? 'PARTIAL' : 'PENDING';

        await tx.creditPayment.create({
          data: { creditId: id, amount: paymentAmount, paymentMethod, notes },
        });

        await tx.credit.update({
          where: { id },
          data: { paidAmount: newPaid, balance, status: status as any },
        });

        const customer = await tx.customer.findUnique({ where: { id: locked.customerId }, select: { currentDebt: true, name: true } });
        const safeDecrement = Math.min(paymentAmount, Math.max(0, Number(customer?.currentDebt ?? paymentAmount)));
        await tx.customer.update({
          where: { id: locked.customerId },
          data: { currentDebt: { decrement: safeDecrement } },
        });

        return [balance, status, customer?.name];
      });

      // Registrar ingreso en caja abierta cuando el abono es en efectivo (best
      // effort) — sin esto, el dinero entra físicamente a la caja pero el
      // arqueo nunca lo espera, así que un cajero podría quedárselo sin que
      // el cierre de turno muestre ningún faltante.
      if (paymentMethod === 'CASH') {
        try {
          const branchId = req.user!.branchId;
          if (branchId) {
            const openRegister = await prisma.cashRegister.findFirst({ where: { branchId, status: 'OPEN' } });
            if (openRegister) {
              await prisma.cashMovement.create({
                data: {
                  cashRegisterId: openRegister.id,
                  type: 'IN',
                  amount: paymentAmount,
                  description: `Abono de crédito${customerName ? ` — ${customerName}` : ''}`,
                  referenceId: id,
                  createdById: req.user!.userId,
                },
              });
            }
          }
        } catch { /* no debe fallar el abono */ }
      }

      if (businessId) {
        emitToBusinesss(businessId, socketEvents.PAYMENT_RECEIVED, { creditId: id, amount: paymentAmount });
        await cache.del(`dashboard:${businessId}`).catch(() => {});
      }

      return success(res, { newBalance, status: newStatus }, 'Pago registrado');
    } catch (err) {
      next(err);
    }
  },

  // Un crédito manual (fiado sin venta, "POST /credits") no tenía forma de
  // corregirse: si se registraba con el cliente o el monto equivocado, el
  // incremento en customer.currentDebt quedaba atrapado para siempre — solo
  // intervención directa en la base de datos. Los créditos LIGADOS a una venta
  // ya se revierten al anular la venta (sale.controller.cancel); este endpoint
  // cubre el caso que faltaba.
  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const businessId = req.user!.businessId;

      await prisma.$transaction(async (tx) => {
        // Lock — misma fila que addPayment()/sale.controller.cancel() bloquean,
        // para no correr contra un abono o una anulación de venta concurrente.
        const [locked] = await tx.$queryRaw<any[]>`
          SELECT c.id, c.status, c.balance, c."customerId", c."saleId"
          FROM credits c
          JOIN customers cu ON c."customerId" = cu.id
          WHERE c.id::text = ${id}
            AND c."deletedAt" IS NULL
            AND cu."businessId" = ${businessId}
          FOR UPDATE
        `;
        if (!locked) throw new AppError('Crédito no encontrado', 404);
        if (locked.status === 'CANCELLED') throw new AppError('Este crédito ya está anulado', 400);
        if (locked.status === 'PAID') throw new AppError('No se puede anular un crédito ya saldado', 400);
        if (locked.saleId) {
          throw new AppError('Este crédito está ligado a una venta — anula la venta para revertirlo', 400);
        }

        // Se revierte el SALDO pendiente, no el monto total — los abonos ya
        // hechos ya descontaron su parte de currentDebt cuando se registraron
        // (ver addPayment), y esos pagos reales se conservan en el historial.
        await tx.customer.update({
          where: { id: locked.customerId },
          data: { currentDebt: { decrement: Number(locked.balance) } },
        });
        await tx.credit.update({
          where: { id },
          data: { status: 'CANCELLED', balance: 0 },
        });
      });

      await cache.del(`dashboard:${businessId}`).catch(() => {});
      return success(res, null, 'Crédito anulado');
    } catch (err) {
      next(err);
    }
  },
};

