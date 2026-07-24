import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../config/database';
import { AppError } from '../utils/response';

/**
 * Garantiza que la cuenta sea de producto "contable" antes de tocar cualquier
 * endpoint de la Agenda.
 *
 * El aislamiento multi-tenant ya lo da businessId, pero esto evita que una cuenta
 * POS cree datos contables por error (o al revés). El tipo no viaja en el token,
 * así que se consulta — es un lookup por PK indexada, barato, y una sola vez por
 * request al montarse a nivel de router.
 */
export async function requireContable(req: AuthRequest, _res: Response, next: NextFunction) {
  try {
    const businessId = req.user?.businessId;
    if (!businessId) return next(new AppError('No autorizado', 401));

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { type: true },
    });
    if (business?.type !== 'contable') {
      return next(new AppError('Esta sección es solo para cuentas de contador', 403));
    }
    next();
  } catch (err) {
    next(err);
  }
}
