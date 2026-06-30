import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getPlan } from '../config/plans';
import { AppError } from '../utils/response';
import { AuthRequest } from './auth';

function planError(feature: string, plan: string) {
  const upgrade = plan === 'free'
    ? ' Actualiza a Pro para continuar.'
    : '';
  return new AppError(`${feature}${upgrade}`, 403);
}

export const planLimit = {
  products() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (limits.products === Infinity) return next();

        const count = await prisma.product.count({
          where: { branchId: { in: business.branches.map((b) => b.id) }, deletedAt: null },
        });
        if (count >= limits.products) {
          return next(planError(`Límite de ${limits.products} productos alcanzado en el plan gratuito.`, business.plan));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  customers() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (limits.customers === Infinity) return next();

        const count = await prisma.customer.count({ where: { deletedAt: null } });
        if (count >= limits.customers) {
          return next(planError(`Límite de ${limits.customers} clientes alcanzado en el plan gratuito.`, business.plan));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  salesPerMonth() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (limits.salesPerMonth === Infinity) return next();

        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);

        const count = await prisma.sale.count({
          where: {
            branchId: { in: business.branches.map((b) => b.id) },
            createdAt: { gte: start },
            deletedAt: null,
          },
        });
        if (count >= limits.salesPerMonth) {
          return next(planError(`Límite de ${limits.salesPerMonth} ventas por mes alcanzado en el plan gratuito.`, business.plan));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  users() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (limits.users === Infinity) return next();

        const count = await prisma.user.count({
          where: { branchId: { in: business.branches.map((b) => b.id) }, deletedAt: null },
        });
        if (count >= limits.users) {
          return next(planError(`Límite de ${limits.users} usuario(s) alcanzado en el plan gratuito.`, business.plan));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  branches() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (limits.branches === Infinity) return next();

        const count = await prisma.branch.count({
          where: { businessId: business.id, deletedAt: null },
        });
        if (count >= limits.branches) {
          return next(planError(`Límite de ${limits.branches} sucursal(es) alcanzado en el plan gratuito.`, business.plan));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  exports() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (!limits.canExport) {
          return next(planError('Las exportaciones están disponibles solo en el plan Pro.', business.plan));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  credits() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (!limits.canUseCredits) {
          return next(planError('El módulo de créditos está disponible solo en el plan Pro.', business.plan));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  suppliers() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (!limits.canUseSuppliers) {
          return next(planError('El módulo de proveedores está disponible solo en el plan Pro.', business.plan));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  // Only blocks when the sale being created is marked as credit (isCredit: true) —
  // regular cash/transfer sales are never restricted by plan.
  saleCredit() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        if (!req.body.isCredit) return next();
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (!limits.canUseCredits) {
          return next(planError('Las ventas a crédito están disponibles solo en el plan Pro.', business.plan));
        }
        next();
      } catch (err) { next(err); }
    };
  },
};

async function getBusinessWithPlan(req: AuthRequest) {
  if (req.user?.role === 'SUPER_ADMIN') return null;
  if (!req.user?.businessId) return null;

  // Check plan expiry: if pro plan expired, treat as free
  const business = await prisma.business.findUnique({
    where: { id: req.user.businessId },
    select: { id: true, plan: true, planExpiresAt: true, branches: { select: { id: true } } },
  });

  if (!business) return null;

  const expiresAt = business.planExpiresAt;
  if (business.plan === 'pro' && expiresAt && expiresAt < new Date()) {
    return { ...business, plan: 'free' };
  }

  return business;
}
