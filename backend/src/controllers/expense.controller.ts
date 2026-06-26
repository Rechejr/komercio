import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';

export const expenseController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const search = getSearch(req);
      const { categoryId, startDate, endDate } = req.query;
      const where: any = { deletedAt: null };
      if (search) where.description = { contains: search, mode: 'insensitive' };
      if (categoryId) where.categoryId = categoryId;
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) where.date.lte = new Date(endDate as string);
      }

      const [expenses, total] = await Promise.all([
        prisma.expense.findMany({
          where, skip, take: limit, orderBy: { date: 'desc' },
          include: { category: { select: { id: true, name: true } } },
        }),
        prisma.expense.count({ where }),
      ]);
      return paginated(res, expenses, total, page, limit);
    } catch (err) { next(err); }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const expense = await prisma.expense.create({
        data: {
          ...req.body,
          amount: parseFloat(req.body.amount),
          date: req.body.date ? new Date(req.body.date) : new Date(),
        },
      });
      return created(res, expense, 'Gasto registrado');
    } catch (err) { next(err); }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const expense = await prisma.expense.update({
        where: { id: req.params.id },
        data: {
          ...req.body,
          amount: req.body.amount ? parseFloat(req.body.amount) : undefined,
          date: req.body.date ? new Date(req.body.date) : undefined,
        },
      });
      return success(res, expense, 'Gasto actualizado');
    } catch (err) { next(err); }
  },

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await prisma.expense.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
      return success(res, null, 'Gasto eliminado');
    } catch (err) { next(err); }
  },

  async getMonthlySummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year, month } = req.query;
      const y = parseInt(year as string) || new Date().getFullYear();
      const m = parseInt(month as string) || new Date().getMonth() + 1;

      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0, 23, 59, 59);

      const summary = await prisma.expense.groupBy({
        by: ['categoryId'],
        where: { date: { gte: start, lte: end }, deletedAt: null },
        _sum: { amount: true },
        _count: { id: true },
      });

      const categories = await prisma.expenseCategory.findMany();
      const catMap = new Map(categories.map((c) => [c.id, c.name]));

      const total = summary.reduce((acc, s) => acc + (s._sum.amount || 0), 0);

      return success(res, {
        period: `${y}-${String(m).padStart(2, '0')}`,
        total,
        byCategory: summary.map((s) => ({
          categoryId: s.categoryId,
          category: catMap.get(s.categoryId || '') || 'Sin categoría',
          total: s._sum.amount || 0,
          count: s._count.id,
        })),
      });
    } catch (err) { next(err); }
  },

  async listCategories(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const categories = await prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
      return success(res, categories);
    } catch (err) { next(err); }
  },

  async createCategory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const cat = await prisma.expenseCategory.create({ data: req.body });
      return created(res, cat, 'Categoría creada');
    } catch (err) { next(err); }
  },
};
