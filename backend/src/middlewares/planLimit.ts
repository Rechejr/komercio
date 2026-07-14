import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { getPlan } from '../config/plans';
import { AppError } from '../utils/response';
import { AuthRequest } from './auth';

// `feature` es solo "Límite de N X" — el plan y el CTA de upgrade se arman aquí,
// para no repetir (ni desincronizar) "en el plan gratuito" en cada mensaje,
// que antes quedaba hardcodeado incluso cuando el límite lo alcanzaba un
// negocio Pro (ej. sucursales, el único límite de Pro que no es Infinity).
function planError(feature: string, plan: string) {
  const planLabel = plan === 'free' ? 'plan gratuito' : 'plan Pro';
  const upgrade = plan === 'free' ? ' Actualiza a Pro para continuar.' : '';
  return new AppError(`${feature} alcanzado en el ${planLabel}.${upgrade}`, 403);
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
          return next(planError(`Límite de ${limits.products} productos`, business.plan));
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

        const count = await prisma.customer.count({ where: { deletedAt: null, businessId: business.id } });
        if (count >= limits.customers) {
          return next(planError(`Límite de ${limits.customers} clientes`, business.plan));
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
          return next(planError(`Límite de ${limits.salesPerMonth} ventas por mes`, business.plan));
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
          return next(planError(`Límite de ${limits.users} usuario(s)`, business.plan));
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
          return next(planError(`Límite de ${limits.branches} bodega(s)`, business.plan));
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
          return next(new AppError('Las exportaciones están disponibles solo en el plan Pro.', 403));
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
          return next(new AppError('El módulo de créditos está disponible solo en el plan Pro.', 403));
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
          return next(new AppError('El módulo de proveedores está disponible solo en el plan Pro.', 403));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  // Toda compra exige un proveedor, y crear proveedores ya es Pro — pero antes
  // de este gate, Compras en sí no tenía ningún bloqueo directo: un negocio que
  // fue Pro, creó proveedores, y luego bajó a gratis podía seguir registrando
  // compras con esos proveedores viejos. Solo se aplica a la creación (POST),
  // igual que suppliers()/credits() — editar/ver compras ya existentes no se
  // restringe, para no dejar esos datos inaccesibles tras un downgrade.
  purchases() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (!limits.canUseSuppliers) {
          return next(new AppError('El módulo de compras está disponible solo en el plan Pro.', 403));
        }
        next();
      } catch (err) { next(err); }
    };
  },

  bulkImport() {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const business = await getBusinessWithPlan(req);
        if (!business) return next();
        const limits = getPlan(business.plan);
        if (!limits.canBulkImport) {
          return next(new AppError('La importación masiva de productos está disponible solo en el plan Pro.', 403));
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
          return next(new AppError('Las ventas a crédito están disponibles solo en el plan Pro.', 403));
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
