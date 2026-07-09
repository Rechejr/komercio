import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
import { success, created, AppError } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/', async (req: any, res, next) => {
  try {
    const businessId = req.user.businessId;
    const categories = await prisma.category.findMany({
      where: { deletedAt: null, businessId: businessId || null },
      orderBy: { name: 'asc' },
      take: 500,
      include: { _count: { select: { products: true } } },
    });
    return success(res, categories);
  } catch (err) { next(err); }
});

router.post('/', authorize('ADMIN', 'SUPERVISOR'), async (req: any, res, next) => {
  try {
    const { name, description, color, icon, parentId } = req.body;
    if (!name?.trim()) throw new AppError('El nombre es requerido', 400);

    const businessId = req.user.businessId;
    const existing = await prisma.category.findFirst({
      where: { businessId: businessId || null, name: { equals: name.trim(), mode: 'insensitive' }, deletedAt: null },
    });
    if (existing) throw new AppError('Ya existe una categoría con ese nombre', 409);

    const cat = await prisma.category.create({
      data: { name: name.trim(), description, color, icon, parentId, businessId: businessId || null },
    });
    return created(res, cat, 'Categoría creada');
  } catch (err) { next(err); }
});

router.put('/:id', authorize('ADMIN', 'SUPERVISOR'), async (req: any, res, next) => {
  try {
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId || null, deletedAt: null },
    });
    if (!existing) throw new AppError('Categoría no encontrada', 404);

    const { name, description, color, icon, parentId } = req.body;
    const cat = await prisma.category.update({ where: { id: req.params.id }, data: { name, description, color, icon, parentId } });
    return success(res, cat, 'Categoría actualizada');
  } catch (err) { next(err); }
});

router.delete('/:id', authorize('ADMIN'), async (req: any, res, next) => {
  try {
    const existing = await prisma.category.findFirst({
      where: { id: req.params.id, businessId: req.user.businessId || null, deletedAt: null },
    });
    if (!existing) throw new AppError('Categoría no encontrada', 404);

    await prisma.category.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
    return success(res, null, 'Categoría eliminada');
  } catch (err) { next(err); }
});

export default router;
