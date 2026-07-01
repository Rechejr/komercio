import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
import { success, created, paginated } from '../utils/response';
import { AppError } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { planLimit } from '../middlewares/planLimit';
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
        select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true, createdAt: true },
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

    if (role === 'SUPER_ADMIN') {
      return next(new AppError('No puedes asignar el rol SUPER_ADMIN', 403));
    }

    if (!password) return next(new AppError('La contraseña es requerida', 400));

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role, branchId },
      select: { id: true, name: true, email: true, role: true },
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
    const businessId: string = req.user.businessId;

    const target = await prisma.user.findFirst({
      where: { id: req.params.id, branch: { businessId } },
    });
    if (!target) return next(new AppError('Usuario no encontrado', 404));

    await prisma.user.update({
      where: { id: req.params.id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return success(res, null, 'Usuario desactivado');
  } catch (err) { next(err); }
});

export default router;