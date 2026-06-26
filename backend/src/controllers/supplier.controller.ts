import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';

export const supplierController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const search = getSearch(req);
      const where: any = { deletedAt: null };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }
      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          where, skip, take: limit, orderBy: { name: 'asc' },
          include: { _count: { select: { products: true, purchases: true } } },
        }),
        prisma.supplier.count({ where }),
      ]);
      return paginated(res, suppliers, total, page, limit);
    } catch (err) { next(err); }
  },

  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const supplier = await prisma.supplier.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: {
          products: { select: { id: true, name: true, code: true, stock: true } },
          purchases: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, invoiceNumber: true, total: true, purchaseDate: true } },
        },
      });
      if (!supplier) throw new AppError('Proveedor no encontrado', 404);
      return success(res, supplier);
    } catch (err) { next(err); }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const supplier = await prisma.supplier.create({ data: req.body });
      return created(res, supplier, 'Proveedor creado');
    } catch (err) { next(err); }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const supplier = await prisma.supplier.update({ where: { id }, data: req.body });
      return success(res, supplier, 'Proveedor actualizado');
    } catch (err) { next(err); }
  },

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await prisma.supplier.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
      return success(res, null, 'Proveedor eliminado');
    } catch (err) { next(err); }
  },
};
