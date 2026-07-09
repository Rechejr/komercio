import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';

export const expenseController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const search = getSearch(req);
      const { categoryId, startDate, endDate } = req.query;
      const businessId = req.user!.businessId;
      const where: any = { deletedAt: null, businessId };
      if (search) where.description = { contains: search, mode: 'insensitive' };
      if (categoryId) where.categoryId = categoryId;
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate as string);
        if (endDate) {
          // Sin esto, "hasta" corta a las 00:00 del día final y excluye casi todo
          // lo registrado ese mismo día (ver export.controller.ts, que sí lo hace).
          const end = new Date(endDate as string);
          end.setUTCHours(23, 59, 59, 999);
          where.date.lte = end;
        }
      }

      const [expenses, total] = await Promise.all([
        prisma.expense.findMany({
          where, skip, take: limit, orderBy: { date: 'desc' },
          include: {
            category: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
          },
        }),
        prisma.expense.count({ where }),
      ]);
      return paginated(res, expenses, total, page, limit);
    } catch (err) { next(err); }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { description, amount, date, categoryId, notes, paymentMethod,
              recipientName, recipientDocument, recipientPhone, supplierId } = req.body;
      if (parseFloat(amount) <= 0) throw new AppError('El monto debe ser mayor a 0', 400);
      const businessId = req.user!.businessId;
      if (categoryId) {
        const cat = await prisma.expenseCategory.findFirst({
          where: { id: categoryId, OR: [{ businessId }, { businessId: null }] },
        });
        if (!cat) throw new AppError('Categoría inválida', 400);
      }
      if (supplierId) {
        const sup = await prisma.supplier.findFirst({ where: { id: supplierId, businessId, deletedAt: null } });
        if (!sup) throw new AppError('Proveedor inválido', 400);
      }
      const base = {
        description,
        amount: parseFloat(amount),
        date: date ? new Date(date) : new Date(),
        categoryId: categoryId || null,
        notes: notes || null,
        paymentMethod: paymentMethod || 'CASH',
        businessId,
      };
      let expense: any;
      try {
        expense = await prisma.expense.create({
          data: {
            ...base,
            recipientName: recipientName || null,
            recipientDocument: recipientDocument || null,
            recipientPhone: recipientPhone || null,
            supplierId: supplierId || null,
          },
        });
      } catch (colErr: any) {
        // Retry without recipient columns while migration 20260703100000 is pending.
        if (colErr?.message?.toLowerCase().includes('column') || colErr?.message?.toLowerCase().includes('does not exist')) {
          expense = await prisma.expense.create({ data: base });
        } else {
          throw colErr;
        }
      }
      // Registrar egreso en caja abierta cuando se paga en efectivo (best effort)
      if (paymentMethod === 'CASH') {
        try {
          const branchId = req.user!.branchId;
          if (branchId) {
            const openRegister = await prisma.cashRegister.findFirst({
              where: { branchId, status: 'OPEN' },
            });
            if (openRegister) {
              await prisma.cashMovement.create({
                data: {
                  cashRegisterId: openRegister.id,
                  type: 'OUT',
                  amount: parseFloat(amount),
                  description: description || 'Gasto',
                  referenceId: expense.id,
                },
              });
            }
          }
        } catch { /* no debe fallar el gasto */ }
      }
      await cache.del(`dashboard:${businessId}`).catch(() => {});
      return created(res, expense, 'Gasto registrado');
    } catch (err) { next(err); }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.expense.findFirst({
        where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
      });
      if (!existing) throw new AppError('Gasto no encontrado', 404);
      const { description, amount, date, categoryId, notes, paymentMethod,
              recipientName, recipientDocument, recipientPhone, supplierId } = req.body;
      if (amount !== undefined && parseFloat(amount) <= 0) throw new AppError('El monto debe ser mayor a 0', 400);
      const businessId = req.user!.businessId;
      if (categoryId) {
        const cat = await prisma.expenseCategory.findFirst({
          where: { id: categoryId, OR: [{ businessId }, { businessId: null }] },
        });
        if (!cat) throw new AppError('Categoría inválida', 400);
      }
      if (supplierId) {
        const sup = await prisma.supplier.findFirst({ where: { id: supplierId, businessId, deletedAt: null } });
        if (!sup) throw new AppError('Proveedor inválido', 400);
      }
      const base = {
        description,
        amount: amount !== undefined ? parseFloat(amount) : undefined,
        date: date !== undefined ? new Date(date) : undefined,
        categoryId: categoryId !== undefined ? (categoryId || null) : undefined,
        notes,
        paymentMethod,
      };
      let expense: any;
      try {
        expense = await prisma.expense.update({
          where: { id: req.params.id },
          data: {
            ...base,
            recipientName: recipientName !== undefined ? (recipientName || null) : undefined,
            recipientDocument: recipientDocument !== undefined ? (recipientDocument || null) : undefined,
            recipientPhone: recipientPhone !== undefined ? (recipientPhone || null) : undefined,
            supplierId: supplierId !== undefined ? (supplierId || null) : undefined,
          },
        });
      } catch (colErr: any) {
        if (colErr?.message?.toLowerCase().includes('column') || colErr?.message?.toLowerCase().includes('does not exist')) {
          expense = await prisma.expense.update({ where: { id: req.params.id }, data: base });
        } else {
          throw colErr;
        }
      }

      // Reconciliar el movimiento de caja que este gasto generó al crearse — si no
      // se toca aquí, corregir el monto (o el método de pago) de un gasto en
      // efectivo deja el cierre de caja descuadrado con el valor viejo para siempre.
      // Solo se ajusta si la caja donde se registró sigue abierta: una vez cerrada,
      // ese cierre ya quedó conciliado y no se debe alterar en retrospectiva.
      try {
        const movement = await prisma.cashMovement.findFirst({
          where: { referenceId: existing.id, type: 'OUT' },
          include: { cashRegister: true },
        });
        const newPaymentMethod = paymentMethod !== undefined ? paymentMethod : existing.paymentMethod;
        const newAmount = amount !== undefined ? parseFloat(amount) : Number(existing.amount);
        const newDescription = (description !== undefined ? description : existing.description) || 'Gasto';

        if (movement && movement.cashRegister.status === 'OPEN') {
          if (newPaymentMethod !== 'CASH') {
            await prisma.cashMovement.delete({ where: { id: movement.id } });
          } else {
            await prisma.cashMovement.update({
              where: { id: movement.id },
              data: { amount: newAmount, description: newDescription },
            });
          }
        } else if (!movement && existing.paymentMethod !== 'CASH' && newPaymentMethod === 'CASH') {
          const branchId = req.user!.branchId;
          if (branchId) {
            const openRegister = await prisma.cashRegister.findFirst({ where: { branchId, status: 'OPEN' } });
            if (openRegister) {
              await prisma.cashMovement.create({
                data: {
                  cashRegisterId: openRegister.id,
                  type: 'OUT',
                  amount: newAmount,
                  description: newDescription,
                  referenceId: existing.id,
                },
              });
            }
          }
        }
      } catch { /* no debe fallar la actualización del gasto */ }

      await cache.del(`dashboard:${businessId}`).catch(() => {});
      return success(res, expense, 'Gasto actualizado');
    } catch (err) { next(err); }
  },

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.expense.findFirst({
        where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
      });
      if (!existing) throw new AppError('Gasto no encontrado', 404);
      await prisma.expense.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });

      // Igual que en update(): si la caja donde se registró el egreso sigue abierta,
      // se elimina también — de lo contrario queda una salida de caja "huérfana"
      // que ya no corresponde a ningún gasto real.
      try {
        const movement = await prisma.cashMovement.findFirst({
          where: { referenceId: existing.id, type: 'OUT' },
          include: { cashRegister: true },
        });
        if (movement && movement.cashRegister.status === 'OPEN') {
          await prisma.cashMovement.delete({ where: { id: movement.id } });
        }
      } catch { /* no debe fallar la eliminación del gasto */ }

      await cache.del(`dashboard:${req.user!.businessId}`).catch(() => {});
      return success(res, null, 'Gasto eliminado');
    } catch (err) { next(err); }
  },

  async getMonthlySummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year, month } = req.query;
      const y = parseInt(year as string) || new Date().getFullYear();
      const m = parseInt(month as string) || new Date().getMonth() + 1;
      const businessId = req.user!.businessId;

      // UTC explícito: expense.date se guarda parseando strings "YYYY-MM-DD" como
      // medianoche UTC (create() hace `new Date(dateString)`), así que construir
      // este rango en el huso horario local del proceso podía correr los límites
      // del mes y mezclar gastos entre meses si el servidor no corre en UTC.
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

      const summary = await prisma.expense.groupBy({
        by: ['categoryId'],
        where: { date: { gte: start, lte: end }, deletedAt: null, businessId },
        _sum: { amount: true },
        _count: { id: true },
      });

      const categories = await prisma.expenseCategory.findMany({
        where: { OR: [{ businessId }, { businessId: null }] },
      });
      const catMap = new Map(categories.map((c) => [c.id, c.name]));

      const total = summary.reduce((acc, s) => acc + Number(s._sum.amount || 0), 0);

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
      const businessId = req.user!.businessId;
      const categories = await prisma.expenseCategory.findMany({
        where: { OR: [{ businessId }, { businessId: null }] },
        orderBy: { name: 'asc' },
      });
      return success(res, categories);
    } catch (err) { next(err); }
  },

  async createCategory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const name = req.body.name?.toString().trim();
      if (!name) throw new AppError('El nombre de la categoría es requerido', 400);
      const businessId = req.user!.businessId;
      const existing = await prisma.expenseCategory.findFirst({
        where: { businessId, name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) throw new AppError('Ya existe una categoría con ese nombre', 409);
      const cat = await prisma.expenseCategory.create({
        data: { name, businessId },
      });
      return created(res, cat, 'Categoría creada');
    } catch (err) { next(err); }
  },

  async deleteCategory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId;
      const existing = await prisma.expenseCategory.findFirst({
        where: { id: req.params.id, businessId },
      });
      if (!existing) throw new AppError('Categoría no encontrada', 404);
      // Los gastos que la usaban quedan sin categoría (FK ON DELETE SET NULL), no se pierden.
      await prisma.expenseCategory.delete({ where: { id: req.params.id } });
      return success(res, null, 'Categoría eliminada');
    } catch (err) { next(err); }
  },
};
