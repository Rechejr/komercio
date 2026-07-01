import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';

export const customerController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const search = getSearch(req);
      const businessId = req.user!.businessId;
      const where: any = { deletedAt: null, businessId };

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { document: { contains: search } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (req.query.hasDebt === 'true') where.currentDebt = { gt: 0 };

      const [customers, total] = await Promise.all([
        prisma.customer.findMany({
          where,
          skip,
          take: limit,
          orderBy: { name: 'asc' },
          select: {
            id: true, name: true, document: true, phone: true,
            email: true, city: true, currentDebt: true, loyaltyPoints: true, isActive: true,
            _count: { select: { sales: true } },
          },
        }),
        prisma.customer.count({ where }),
      ]);

      return paginated(res, customers, total, page, limit);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const customer = await prisma.customer.findFirst({
        where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
        include: {
          sales: {
            orderBy: { createdAt: 'desc' },
            take: 10,
            select: {
              id: true, invoiceNumber: true, total: true, status: true, createdAt: true,
            },
          },
          credits: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });
      if (!customer) throw new AppError('Cliente no encontrado', 404);
      return success(res, customer);
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { creditLimit, ...rest } = req.body;
      const customer = await prisma.customer.create({
        data: {
          ...rest,
          businessId: req.user!.businessId,
          creditLimit: creditLimit != null && creditLimit !== '' ? parseFloat(creditLimit) : 0,
        },
      });
      return created(res, customer, 'Cliente creado');
    } catch (err) {
      next(err);
    }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.customer.findFirst({
        where: { id, deletedAt: null, businessId: req.user!.businessId },
      });
      if (!existing) throw new AppError('Cliente no encontrado', 404);

      const { creditLimit, ...rest } = req.body;
      const customer = await prisma.customer.update({
        where: { id },
        data: { ...rest, ...(creditLimit != null && creditLimit !== '' ? { creditLimit: parseFloat(creditLimit) } : {}) },
      });
      return success(res, customer, 'Cliente actualizado');
    } catch (err) {
      next(err);
    }
  },

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.customer.findFirst({
        where: { id, deletedAt: null, businessId: req.user!.businessId },
      });
      if (!existing) throw new AppError('Cliente no encontrado', 404);
      await prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
      return success(res, null, 'Cliente eliminado');
    } catch (err) {
      next(err);
    }
  },

  async getPurchaseHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const { id } = req.params;

      // Verify the customer belongs to this business
      const customer = await prisma.customer.findFirst({
        where: { id, deletedAt: null, businessId: req.user!.businessId },
      });
      if (!customer) throw new AppError('Cliente no encontrado', 404);

      const [sales, total] = await Promise.all([
        prisma.sale.findMany({
          where: { customerId: id, deletedAt: null },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { details: { include: { product: { select: { name: true } } } } },
        }),
        prisma.sale.count({ where: { customerId: id, deletedAt: null } }),
      ]);

      return paginated(res, sales, total, page, limit);
    } catch (err) {
      next(err);
    }
  },
};
