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
      select: { type: true, planExpiresAt: true },
    });
    if (business?.type !== 'contable') {
      return next(new AppError('Esta sección es solo para cuentas de contador', 403));
    }
    // Se guarda el estado de la suscripción para requireActiveContable (evita una
    // segunda consulta) y para que el panel informe los días restantes.
    (req as AuthRequest & { planExpiresAt?: Date | null }).planExpiresAt = business.planExpiresAt;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Exige suscripción activa (prueba vigente o plan pagado) para ESCRIBIR.
 *
 * Se aplica solo a los endpoints de escritura de la Agenda. La lectura queda
 * libre: al vencer la prueba, el contador sigue viendo sus clientes y
 * vencimientos (solo-lectura), pero no puede crear ni editar hasta renovar. Sus
 * datos nunca se tocan. Debe ir DESPUÉS de requireContable (usa su lookup).
 */
export function requireActiveContable(req: AuthRequest, _res: Response, next: NextFunction) {
  const planExpiresAt = (req as AuthRequest & { planExpiresAt?: Date | null }).planExpiresAt;
  const activo = planExpiresAt != null && new Date(planExpiresAt) > new Date();
  if (!activo) {
    return next(new AppError(
      'Tu prueba o suscripción venció. Renueva tu plan para seguir editando; tus datos siguen disponibles para consulta.',
      402, // Payment Required
    ));
  }
  next();
}
