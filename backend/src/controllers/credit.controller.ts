import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';
import { emitToBusinesss, socketEvents } from '../config/socket';

export const creditController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const { status, customerId } = req.query;

      // Marca como OVERDUE cualquier crédito vencido que siga PENDING o PARTIAL
      await prisma.credit.updateMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { lt: new Date() },
          deletedAt: null,
        },
        data: { status: 'OVERDUE' },
      }).catch(() => {});

      const where: any = { deletedAt: null };
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
        where: { id: req.params.id, deletedAt: null },
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

      return created(res, credit, 'Crédito registrado');
    } catch (err) {
      next(err);
    }
  },

  async addPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, notes } = req.body;

      const credit = await prisma.credit.findFirst({ where: { id, deletedAt: null } });
      if (!credit) throw new AppError('Crédito no encontrado', 404);
      if (credit.status === 'PAID') throw new AppError('Este crédito ya está saldado', 400);

      const paymentAmount = parseFloat(amount);
      if (paymentAmount > credit.balance) throw new AppError('El pago supera el saldo pendiente', 400);

      const newPaid = credit.paidAmount + paymentAmount;
      const newBalance = credit.totalAmount - newPaid;
      const newStatus = newBalance <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'PENDING';

      await prisma.$transaction(async (tx) => {
        await tx.creditPayment.create({
          data: { creditId: id, amount: paymentAmount, paymentMethod, notes },
        });

        await tx.credit.update({
          where: { id },
          data: { paidAmount: newPaid, balance: newBalance, status: newStatus as any },
        });

        await tx.customer.update({
          where: { id: credit.customerId },
          data: { currentDebt: { decrement: paymentAmount } },
        });
      });

      const businessId = req.user?.businessId;
      if (businessId) {
        emitToBusinesss(businessId, socketEvents.PAYMENT_RECEIVED, { creditId: id, amount: paymentAmount });
      }

      return success(res, { newBalance, status: newStatus }, 'Pago registrado');
    } catch (err) {
      next(err);
    }
  },
};
