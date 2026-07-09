import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';
import { getPlan } from '../config/plans';
import { acquirePlanLimitLock } from '../utils/planLimitLock';

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
            email: true, city: true, address: true, notes: true, creditLimit: true,
            currentDebt: true, loyaltyPoints: true, isActive: true,
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
          _count: { select: { sales: true } },
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
      const { email, phone, document, documentType, address, city, notes, creditLimit } = req.body;
      const name = req.body.name?.toString().trim();
      if (!name) throw new AppError('El nombre del cliente es requerido', 400);
      const businessId = req.user!.businessId!;
      if (phone) {
        // El documento ya tiene un unique constraint en el schema; el celular no,
        // así que sin este chequeo el mismo cliente podía quedar duplicado (typo
        // en el documento) con la deuda repartida entre dos fichas distintas.
        const dupPhone = await prisma.customer.findFirst({
          where: { businessId, phone, deletedAt: null },
        });
        if (dupPhone) throw new AppError(`Ya existe un cliente con este celular: ${dupPhone.name}`, 409);
      }

      const customer = await prisma.$transaction(async (tx) => {
        // Mismo recuento atómico que en productos — ver planLimitLock.ts.
        await acquirePlanLimitLock(tx, businessId, 'customers');
        const biz = await tx.business.findUnique({ where: { id: businessId }, select: { plan: true, planExpiresAt: true } });
        if (biz) {
          const effectivePlan = biz.plan === 'pro' && biz.planExpiresAt && biz.planExpiresAt < new Date() ? 'free' : biz.plan;
          const limits = getPlan(effectivePlan);
          if (limits.customers !== Infinity) {
            const count = await tx.customer.count({ where: { businessId, deletedAt: null } });
            if (count >= limits.customers) {
              throw new AppError(`Límite de ${limits.customers} clientes alcanzado en el plan gratuito. Actualiza a Pro para continuar.`, 403);
            }
          }
        }

        return tx.customer.create({
          data: {
            name,
            email: email || null,
            phone: phone || null,
            document: document || null,
            documentType: documentType || null,
            address: address || null,
            city: city || null,
            notes: notes || null,
            businessId,
            creditLimit: creditLimit != null && creditLimit !== '' ? parseFloat(creditLimit) : 0,
          },
        });
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

      const { name, email, phone, document, documentType, address, city, notes, creditLimit } = req.body;
      if (phone) {
        const dupPhone = await prisma.customer.findFirst({
          where: { businessId: req.user!.businessId, phone, deletedAt: null, id: { not: id } },
        });
        if (dupPhone) throw new AppError(`Ya existe un cliente con este celular: ${dupPhone.name}`, 409);
      }
      const customer = await prisma.customer.update({
        where: { id },
        data: {
          name,
          email: email !== undefined ? (email || null) : undefined,
          phone: phone !== undefined ? (phone || null) : undefined,
          document: document !== undefined ? (document || null) : undefined,
          documentType,
          address: address !== undefined ? (address || null) : undefined,
          city: city !== undefined ? (city || null) : undefined,
          notes,
          ...(creditLimit != null && creditLimit !== '' ? { creditLimit: parseFloat(creditLimit) } : {}),
        },
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
      if (Number(existing.currentDebt) > 0) {
        throw new AppError('No se puede eliminar un cliente con deuda pendiente. Salda o anula sus créditos primero.', 400);
      }
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
          where: { customerId: id, deletedAt: null, branch: { businessId: req.user!.businessId } },
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: { details: { include: { product: { select: { name: true } } } } },
        }),
        prisma.sale.count({ where: { customerId: id, deletedAt: null, branch: { businessId: req.user!.businessId } } }),
      ]);

      return paginated(res, sales, total, page, limit);
    } catch (err) {
      next(err);
    }
  },
};
