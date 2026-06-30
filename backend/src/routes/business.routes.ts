import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
import { success } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/me', async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { branch: { include: { business: true } } },
    });
    return success(res, user?.branch?.business || null);
  } catch (err) { next(err); }
});

router.put('/me', authorize('ADMIN'), async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { branch: true },
    });
    if (!user?.branch?.businessId) return success(res, null, 'No tiene negocio asociado');

    const { name, legalName, nit, phone, email, address, city, country, logo, currency, taxRate, settings } = req.body;
    const business = await prisma.business.update({
      where: { id: user.branch.businessId },
      data: { name, legalName, nit, phone, email, address, city, country, logo, currency, taxRate, settings },
    });
    return success(res, business, 'Negocio actualizado');
  } catch (err) { next(err); }
});

router.get('/branches', async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { branch: { select: { businessId: true } } },
    });
    const branches = await prisma.branch.findMany({
      where: { businessId: user?.branch?.businessId, deletedAt: null },
    });
    return success(res, branches);
  } catch (err) { next(err); }
});

export default router;
