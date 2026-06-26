import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
import { success, created } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const brands = await prisma.brand.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
    return success(res, brands);
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const brand = await prisma.brand.create({ data: req.body });
    return created(res, brand, 'Marca creada');
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const brand = await prisma.brand.update({ where: { id: req.params.id }, data: req.body });
    return success(res, brand, 'Marca actualizada');
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    await prisma.brand.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    return success(res, null, 'Marca eliminada');
  } catch (err) { next(err); }
});

export default router;
