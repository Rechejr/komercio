import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { success, created } from '../utils/response';
import { AppError } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const brands = await prisma.brand.findMany({
      where: { deletedAt: null, businessId: req.user!.businessId },
      orderBy: { name: 'asc' },
    });
    return success(res, brands);
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN', 'SUPERVISOR'), async (req: AuthRequest, res, next) => {
  try {
    const { name, logo } = req.body;
    const brand = await prisma.brand.create({
      data: { name, logo, businessId: req.user!.businessId },
    });
    return created(res, brand, 'Marca creada');
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'SUPERVISOR'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.brand.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
    });
    if (!existing) throw new AppError('Marca no encontrada', 404);
    const { name, logo } = req.body;
    const brand = await prisma.brand.update({ where: { id: req.params.id }, data: { name, logo } });
    return success(res, brand, 'Marca actualizada');
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const existing = await prisma.brand.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
    });
    if (!existing) throw new AppError('Marca no encontrada', 404);
    await prisma.brand.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    return success(res, null, 'Marca eliminada');
  } catch (err) { next(err); }
});

export default router;
