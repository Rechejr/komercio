import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
import { success, created, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(authenticate);

router.get('/', authorize('ADMIN', 'SUPERVISOR'), async (req: any, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { deletedAt: null },
        skip, take: limit,
        select: { id: true, name: true, email: true, role: true, isActive: true, lastLogin: true, createdAt: true },
      }),
      prisma.user.count({ where: { deletedAt: null } }),
    ]);
    return paginated(res, users, total, page, limit);
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN'), async (req: any, res, next) => {
  try {
    const { name, email, password, role, branchId } = req.body;
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role, branchId },
      select: { id: true, name: true, email: true, role: true },
    });
    return created(res, user, 'Usuario creado');
  } catch (err) { next(err); }
});

router.patch('/:id', authorize('ADMIN'), async (req: any, res, next) => {
  try {
    const { name, role, isActive, branchId } = req.body;
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, role, isActive, branchId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    return success(res, user, 'Usuario actualizado');
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), async (req: any, res, next) => {
  try {
    await prisma.user.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), isActive: false } });
    return success(res, null, 'Usuario desactivado');
  } catch (err) { next(err); }
});

export default router;
