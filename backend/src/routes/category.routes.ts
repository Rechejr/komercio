import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
import { success, created } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: true } } },
    });
    return success(res, categories);
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const { name, description, color, icon, parentId } = req.body;
    const cat = await prisma.category.create({ data: { name, description, color, icon, parentId } });
    return created(res, cat, 'Categoría creada');
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'SUPERVISOR'), async (req, res, next) => {
  try {
    const { name, description, color, icon, parentId } = req.body;
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: { name, description, color, icon, parentId } });
    return success(res, cat, 'Categoría actualizada');
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    await prisma.category.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    return success(res, null, 'Categoría eliminada');
  } catch (err) { next(err); }
});

export default router;
