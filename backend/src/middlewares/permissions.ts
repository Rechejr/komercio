import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError } from '../utils/response';
import { AuthRequest } from './auth';
import { permisosEfectivos, puedeTodo } from '../config/permissions';

// Los permisos NO viajan en el JWT a propósito: si viajaran, quitarle un permiso
// a alguien no surtiría efecto hasta que su token venciera (hasta 15 minutos
// después), y el dueño que acaba de destildar "anular ventas" espera que el
// cambio sea de una. Se leen de la base y se cachean cortito; al guardar
// permisos se borra la llave, así que el efecto es inmediato.
const TTL = 300; // 5 minutos
const llave = (userId: string) => `perms:${userId}`;

interface PermisosUsuario {
  permisos: string[];
  todo: boolean;
}

async function cargarPermisos(userId: string, rolDelToken: string): Promise<PermisosUsuario> {
  const enCache = await cache.get<PermisosUsuario>(llave(userId));
  if (enCache) return enCache;

  // Ojo con el catch: si la lectura falla (base intermitente) NO se niega el
  // paso, se cae al rol que trae el token — que es exactamente lo que hacía
  // authorize() antes de esto. Así un tropiezo de la base no encierra a nadie
  // fuera de su trabajo ni, al revés, le abre puertas que su rol no tenía.
  let user = null;
  try {
    user = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        role: true,
        permissions: true,
        // El dueño se reconoce por ser owner de algún negocio vivo: a él nadie
        // le puede recortar nada, ni siquiera otro administrador.
        businesses: { where: { deletedAt: null }, select: { id: true }, take: 1 },
      },
    });
  } catch {
    user = null;
  }
  if (!user) {
    return { permisos: permisosEfectivos(rolDelToken, null), todo: rolDelToken === 'SUPER_ADMIN' };
  }

  const rol = user.role ?? rolDelToken;
  const datos: PermisosUsuario = {
    permisos: permisosEfectivos(rol, user.permissions),
    todo: puedeTodo(rol, (user.businesses?.length ?? 0) > 0),
  };
  await cache.set(llave(userId), datos, TTL);
  return datos;
}

/** Se llama al cambiar rol o permisos para que el usuario lo sienta de una. */
export async function invalidarPermisos(userId: string): Promise<void> {
  await cache.del(llave(userId));
}

/**
 * Exige una llave de permiso. Reemplaza a `authorize(...)`: el rol sigue
 * definiendo el punto de partida (config/permissions.ts), pero el dueño puede
 * darle o quitarle acciones sueltas a una persona sin cambiarle el rol.
 */
export function requirePermission(...llaves: string[]) {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) return next(new AppError('No autorizado', 401));

      const datos = await cargarPermisos(req.user.userId, req.user.role);
      if (datos.todo) return next();

      // Con varias llaves basta UNA (ej. ver el detalle de una compra lo puede
      // hacer quien la registra o quien solo consulta).
      const tiene = llaves.some((k) => datos.permisos.includes(k));
      if (!tiene) return next(new AppError('No tienes permisos para esta acción', 403));

      next();
    } catch (err) { next(err); }
  };
}

/** Los permisos de alguien, para pintarlos en /auth/me y en la pantalla de equipo. */
export async function permisosDe(userId: string, rolDelToken: string): Promise<PermisosUsuario> {
  return cargarPermisos(userId, rolDelToken);
}
