import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { AppError } from '../utils/response';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new AppError('No autorizado', 401));
  }
  const token = authHeader.slice(7);
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new AppError('Token inválido o expirado', 401));
  }
}

export function authorize(...roles: string[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError('No autorizado', 401));
    if (!roles.includes(req.user.role)) {
      return next(new AppError('No tienes permisos para esta acción', 403));
    }
    next();
  };
}

// Los endpoints que solo dependen de la cookie httpOnly (sin Authorization header)
// no tienen ninguna defensa contra CSRF por sí solos — un sitio malicioso podría
// disparar un POST cross-site y el navegador adjuntaría la cookie igual (más aún
// en producción, donde sameSite es "none" para permitir el dominio cruzado
// frontend/backend). Exigir este header fuerza un preflight de CORS en cualquier
// request cross-origin, que ya rechazamos salvo que el origin esté en la lista
// blanca — y un <form>/<img> clásico no puede agregar headers personalizados.
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction) {
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return next(new AppError('Solicitud no permitida', 403));
  }
  next();
}
