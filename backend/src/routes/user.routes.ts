import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middlewares/auth';
import { requirePermission } from '../middlewares/permissions';
import { invalidarPermisos } from '../middlewares/permissions';
import {
  PERMISOS, ROL_LABEL, ROL_HINT, ROLES_ASIGNABLES, DEFAULTS_POR_ROL,
  permisosEfectivos, normalizarOverrides, soloDiferencias,
} from '../config/permissions';
import { success, created, paginated } from '../utils/response';
import { AppError } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { planLimit } from '../middlewares/planLimit';
import { getPlan } from '../config/plans';
import { acquirePlanLimitLock } from '../utils/planLimitLock';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(authenticate);

// CRIT-04: filtra usuarios por las sucursales del negocio autenticado
router.get('/', requirePermission('configuracion.usuarios'), async (req: any, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const businessId: string = req.user.businessId;

    const where = {
      deletedAt: null,
      branch: { businessId },
    };

    // Quién es el dueño: a él no se le pueden recortar permisos, así que la
    // pantalla ni siquiera le muestra el botón.
    const negocio = await prisma.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip, take: limit,
        select: {
          id: true, name: true, email: true, role: true, isActive: true,
          lastLogin: true, createdAt: true, branchId: true, permissions: true,
        },
      }),
      prisma.user.count({ where }),
    ]);
    // Se manda el permiso ya calculado (rol + marcas) para que la pantalla no
    // tenga que repetir la cuenta y arriesgarse a mostrar algo distinto de lo
    // que el servidor realmente deja hacer.
    const conPermisos = users.map((u) => ({
      ...u,
      isOwner: u.id === negocio?.ownerId,
      permissions: normalizarOverrides(u.permissions),
      permisosEfectivos: permisosEfectivos(u.role, u.permissions),
    }));
    return paginated(res, conPermisos, total, page, limit);
  } catch (err) { next(err); }
});

// Catálogo de permisos + roles asignables, para dibujar la pantalla de equipo.
// Va antes de '/:id' y lo puede leer cualquiera que gestione usuarios.
router.get('/permissions/catalog', requirePermission('configuracion.usuarios', 'contable.usuarios'), async (req: any, res, next) => {
  try {
    const negocio = await prisma.business.findUnique({
      where: { id: req.user.businessId },
      select: { type: true },
    });
    const producto = negocio?.type === 'contable' ? 'contable' : 'pos';

    const roles = ROLES_ASIGNABLES[producto].map((r) => ({
      value: r,
      label: ROL_LABEL[r] ?? r,
      hint: ROL_HINT[r] ?? '',
      // Lo que trae el rol por defecto: la pantalla parte de aquí y el dueño
      // ajusta desde ahí.
      permisos: (DEFAULTS_POR_ROL[r] ?? []).filter((k) =>
        producto === 'contable' ? k.startsWith('contable.') : !k.startsWith('contable.')),
    }));

    return success(res, {
      producto,
      permisos: PERMISOS.filter((x) => x.producto === producto),
      roles,
    });
  } catch (err) { next(err); }
});

// CRIT-05 (POST): bloquea creación de SUPER_ADMIN por esta vía
router.post('/', requirePermission('configuracion.usuarios'), planLimit.users(), async (req: any, res, next) => {
  try {
    const { name, email, password, role, branchId } = req.body;
    const businessId: string = req.user.businessId;

    if (role === 'SUPER_ADMIN') {
      return next(new AppError('No puedes asignar el rol SUPER_ADMIN', 403));
    }

    // Cada producto tiene sus roles: un "Cajero" no significa nada en una
    // oficina contable, ni un "Auxiliar" en una tienda.
    const negocio = await prisma.business.findUnique({ where: { id: businessId }, select: { type: true } });
    const producto = negocio?.type === 'contable' ? 'contable' : 'pos';
    if (role && !ROLES_ASIGNABLES[producto].includes(role)) {
      return next(new AppError('Ese rol no aplica para este producto', 400));
    }

    if (!password) return next(new AppError('La contraseña es requerida', 400));

    // Un empleado se vincula al negocio SOLO a través de su bodega — el modelo
    // User no tiene businessId propio; el businessId del login sale de
    // branch.businessId (ver auth.controller.ts). Un usuario sin bodega queda
    // huérfano: sin businessId no puede acceder a nada, no aparece en la lista
    // de empleados (que filtra por branch.businessId) y no cuenta para el límite
    // del plan. Por eso la bodega es obligatoria; si el admin no la eligió, se
    // asigna la más antigua del negocio (siempre existe una, se crea al registrar).
    let effectiveBranchId: string;
    if (branchId) {
      const validBranch = await prisma.branch.findFirst({
        where: { id: branchId, businessId, deletedAt: null },
        select: { id: true },
      });
      if (!validBranch) return next(new AppError('Bodega no válida para este negocio', 403));
      effectiveBranchId = branchId;
    } else {
      const oldest = await prisma.branch.findFirst({
        where: { businessId, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!oldest) return next(new AppError('No se encontró una bodega para este negocio', 400));
      effectiveBranchId = oldest.id;
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async (tx) => {
      // Mismo recuento atómico que en productos/clientes — ver planLimitLock.ts.
      await acquirePlanLimitLock(tx, businessId, 'users');
      const biz = await tx.business.findUnique({ where: { id: businessId }, select: { plan: true, planExpiresAt: true } });
      if (biz) {
        const effectivePlan = biz.plan === 'pro' && biz.planExpiresAt && biz.planExpiresAt < new Date() ? 'free' : biz.plan;
        const limits = getPlan(effectivePlan);
        if (limits.users !== Infinity) {
          const branchIds = (await tx.branch.findMany({ where: { businessId, deletedAt: null }, select: { id: true } })).map((b) => b.id);
          const count = await tx.user.count({ where: { branchId: { in: branchIds }, deletedAt: null } });
          if (count >= limits.users) {
            throw new AppError(`Límite de ${limits.users} usuario(s) alcanzado en el plan gratuito. Actualiza a Pro para continuar.`, 403);
          }
        }
      }

      return tx.user.create({
        data: { name, email, password: hashed, role, branchId: effectiveBranchId, isEmailVerified: true },
        select: { id: true, name: true, email: true, role: true },
      });
    });
    return created(res, user, 'Usuario creado');
  } catch (err) { next(err); }
});

// CRIT-05 (PATCH): verifica que el usuario target pertenezca al mismo negocio
router.patch('/:id', requirePermission('configuracion.usuarios'), async (req: any, res, next) => {
  try {
    const businessId: string = req.user.businessId;

    const target = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null, branch: { businessId } },
    });
    if (!target) return next(new AppError('Usuario no encontrado', 404));

    const { name, role, isActive, branchId } = req.body;

    if (role === 'SUPER_ADMIN') {
      return next(new AppError('No puedes asignar el rol SUPER_ADMIN', 403));
    }

    // Mismo riesgo que en DELETE — un admin no debería poder desactivarse ni
    // quitarse el rol ADMIN a sí mismo y quedar el negocio sin nadie que administre.
    if (req.params.id === req.user.userId && (isActive === false || (role && role !== 'ADMIN'))) {
      return next(new AppError('No puedes desactivarte ni quitarte el rol de administrador a ti mismo', 400));
    }

    // La bodega es obligatoria (ver POST): sin ella el usuario queda huérfano
    // del negocio. Si el body la trae presente pero vacía/null, es un intento
    // de "Sin bodega asignada" — se rechaza. Si no viene en el body (undefined),
    // se deja igual. Si viene con valor, debe pertenecer al negocio.
    if ('branchId' in req.body && !branchId) {
      return next(new AppError('Debes asignar una bodega al usuario', 400));
    }
    if (branchId && branchId !== target.branchId) {
      const validBranch = await prisma.branch.findFirst({
        where: { id: branchId, businessId, deletedAt: null },
        select: { id: true },
      });
      if (!validBranch) return next(new AppError('Bodega no válida para este negocio', 400));
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, role, isActive, branchId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    // El rol cambia los permisos: sin esto el usuario seguiría con los de antes
    // hasta que venciera el caché.
    await invalidarPermisos(req.params.id);
    return success(res, user, 'Usuario actualizado');
  } catch (err) { next(err); }
});

// Marcar o desmarcar permisos sueltos a un empleado. Solo se guarda lo que
// DIFIERE de su rol: si mañana le cambian el rol, las marcas siguen leyéndose
// como "esto se lo di aparte" y no como una copia congelada del rol viejo.
router.patch('/:id/permissions', requirePermission('configuracion.usuarios', 'contable.usuarios'), async (req: any, res, next) => {
  try {
    const businessId: string = req.user.businessId;

    const target = await prisma.user.findFirst({
      where: { id: req.params.id, deletedAt: null, branch: { businessId } },
      select: { id: true, role: true, name: true },
    });
    if (!target) return next(new AppError('Usuario no encontrado', 404));

    // El dueño no se puede recortar a sí mismo y quedar sin acceso a su negocio.
    const esDueno = await prisma.business.findFirst({
      where: { ownerId: req.params.id, deletedAt: null },
      select: { id: true },
    });
    if (esDueno) return next(new AppError('El dueño de la cuenta siempre tiene todos los permisos', 400));

    const marcas = soloDiferencias(target.role, normalizarOverrides(req.body?.permissions));
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { permissions: marcas },
      select: { id: true, name: true, role: true, permissions: true },
    });
    await invalidarPermisos(target.id);

    return success(res, {
      ...user,
      permisosEfectivos: permisosEfectivos(user.role, user.permissions),
    }, `Permisos de "${target.name}" actualizados`);
  } catch (err) { next(err); }
});

// CRIT-05 (DELETE): verifica que el usuario target pertenezca al mismo negocio
router.delete('/:id', requirePermission('configuracion.usuarios'), async (req: any, res, next) => {
  try {
    // Sin este chequeo, un admin podría eliminarse a sí mismo por la API y
    // dejar el negocio sin ningún administrador con quien recuperar el acceso.
    if (req.params.id === req.user.userId) {
      return next(new AppError('No puedes eliminar tu propia cuenta', 400));
    }

    const businessId: string = req.user.businessId;

    const target = await prisma.user.findFirst({
      where: { id: req.params.id, branch: { businessId } },
    });
    if (!target) return next(new AppError('Usuario no encontrado', 404));

    await prisma.user.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    await invalidarPermisos(req.params.id);
    return success(res, null, 'Empleado eliminado');
  } catch (err) { next(err); }
});

export default router;