import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { success, AppError } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';

const MAX = 5;

export const searchController = {
  async search(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const q = String(req.query.q || '').trim();
      if (q.length < 2) return next(new AppError('La búsqueda requiere al menos 2 caracteres', 400));

      const businessId = req.user!.businessId!;

      // ── Atajo especial: "fiado" devuelve todos los créditos pendientes ──────
      if (q.toLowerCase() === 'fiado') {
        const credits = await prisma.credit.findMany({
          where: {
            status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
            customer: { businessId, deletedAt: null },
          },
          select: {
            id: true, balance: true, status: true, dueDate: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
          orderBy: { balance: 'desc' },
          take: 100,
        });
        return success(res, {
          customers: [], products: [], sales: [], suppliers: [],
          credits, isFiadoQuery: true,
        });
      }

      // ── Búsqueda normal ──────────────────────────────────────────────────────
      const contains = { contains: q, mode: 'insensitive' as const };

      const [customers, products, sales, suppliers, credits] = await Promise.all([
        prisma.customer.findMany({
          where: {
            businessId, deletedAt: null, isActive: true,
            OR: [{ name: contains }, { document: contains }, { phone: contains }],
          },
          select: { id: true, name: true, document: true, phone: true, currentDebt: true },
          take: MAX,
        }),

        prisma.product.findMany({
          where: {
            businessId, deletedAt: null, isActive: true,
            OR: [{ name: contains }, { code: contains }],
          },
          select: { id: true, name: true, code: true, stock: true, salePrice: true },
          take: MAX,
        }),

        prisma.sale.findMany({
          where: {
            branch: { businessId },
            deletedAt: null,
            OR: [
              { invoiceNumber: contains },
              { customer: { name: contains } },
            ],
          },
          select: {
            id: true, invoiceNumber: true, total: true, status: true, createdAt: true,
            customer: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: MAX,
        }),

        prisma.supplier.findMany({
          where: {
            businessId, deletedAt: null, isActive: true,
            OR: [{ name: contains }, { contactName: contains }, { phone: contains }],
          },
          select: { id: true, name: true, contactName: true, phone: true },
          take: MAX,
        }),

        prisma.credit.findMany({
          where: {
            status: { notIn: ['PAID', 'CANCELLED'] },
            customer: { businessId, deletedAt: null, name: contains },
          },
          select: {
            id: true, balance: true, status: true,
            customer: { select: { id: true, name: true } },
          },
          take: MAX,
        }),
      ]);

      return success(res, { customers, products, sales, suppliers, credits, isFiadoQuery: false });
    } catch (err) {
      next(err);
    }
  },
};
