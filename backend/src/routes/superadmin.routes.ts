import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middlewares/auth';
import { AppError, success, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';

const router = Router();

router.use(authenticate);
router.use((req: AuthRequest, _res, next) => {
  if (req.user?.role !== 'SUPER_ADMIN') return next(new AppError('Acceso restringido', 403));
  next();
});

router.get('/stats', async (_req, res, next) => {
  try {
    const [totalBusinesses, totalUsers, freePlan, proPlan, salesAgg, recentBusinesses] = await Promise.all([
      prisma.business.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, role: { not: 'SUPER_ADMIN' } } }),
      prisma.business.count({ where: { deletedAt: null, plan: 'free' } }),
      prisma.business.count({ where: { deletedAt: null, plan: 'pro' } }),
      prisma.sale.aggregate({
        where: { deletedAt: null, status: 'COMPLETED' },
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.business.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, name: true, plan: true, createdAt: true,
          owner: { select: { email: true, name: true } },
        },
      }),
    ]);

    return success(res, {
      totalBusinesses,
      totalUsers,
      plans: { free: freePlan, pro: proPlan },
      sales: { total: salesAgg._sum.total || 0, count: salesAgg._count.id },
      recentBusinesses,
    });
  } catch (err) { next(err); }
});

router.get('/businesses', async (req: AuthRequest, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { search, plan } = req.query;

    const where: any = { deletedAt: null };
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (plan) where.plan = plan;

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, plan: true, planExpiresAt: true,
          createdAt: true, city: true,
          owner: { select: { id: true, name: true, email: true } },
          _count: { select: { branches: true } },
        },
      }),
      prisma.business.count({ where }),
    ]);

    return paginated(res, businesses, total, page, limit);
  } catch (err) { next(err); }
});

router.patch('/businesses/:id/plan', async (req, res, next) => {
  try {
    const { plan, planExpiresAt } = req.body;

    if (!['free', 'pro'].includes(plan)) throw new AppError('Plan inválido. Use "free" o "pro"', 400);

    const business = await prisma.business.update({
      where: { id: req.params.id },
      data: {
        plan,
        planExpiresAt: planExpiresAt ? new Date(planExpiresAt) : null,
      },
      select: { id: true, name: true, plan: true, planExpiresAt: true },
    });

    return success(res, business, `Plan de "${business.name}" actualizado a ${plan}`);
  } catch (err) { next(err); }
});

router.patch('/businesses/:id/status', async (req, res, next) => {
  try {
    const { active } = req.body;

    const business = await prisma.business.update({
      where: { id: req.params.id },
      data: { deletedAt: active ? null : new Date() },
      select: { id: true, name: true, deletedAt: true },
    });

    return success(res, business, active ? `"${business.name}" activado` : `"${business.name}" desactivado`);
  } catch (err) { next(err); }
});

export default router;
