import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
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
router.get('/', authorize('ADMIN', 'SUPERVISOR'), async (req: any, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const businessId: string = req.user.businessId;

    const where = {
      deletedAt: null,
      branch: { businessId },
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip, take: limit,
        select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true, createdAt: true, branchId: true },
      }),
      prisma.user.count({ where }),
    ]);
    return paginated(res, users, total, page, limit);
  } catch (err) { next(err); }
});

// CRIT-05 (POST): bloquea creación de SUPER_ADMIN por esta vía
router.post('/', authorize('ADMIN'), planLimit.users(), async (req: any, res, next) => {
  try {
    const { name, email, password, role, branchId } = req.body;
    const businessId: string = req.user.businessId;

    if (role === 'SUPER_ADMIN') {
      return next(new AppError('No puedes asignar el rol SUPER_ADMIN', 403));
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
router.patch('/:id', authorize('ADMIN'), async (req: any, res, next) => {
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
    return success(res, user, 'Usuario actualizado');
  } catch (err) { next(err); }
});

// CRIT-05 (DELETE): verifica que el usuario target pertenezca al mismo negocio
router.delete('/:id', authorize('ADMIN'), async (req: any, res, next) => {
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
    return success(res, null, 'Empleado eliminado');
  } catch (err) { next(err); }
});

export default router;