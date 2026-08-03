import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middlewares/auth';
import { success, paginated } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { pruneStaleLowStockNotifications } from '../services/notification.service';

const router = Router();
router.use(authenticate);

router.get('/unread-count', async (req: any, res, next) => {
  try {
    // Mantiene la campanita al día: quita alertas de stock bajo de productos ya
    // borrados o que ya se resurtieron, para no contar notificaciones obsoletas.
    await pruneStaleLowStockNotifications(req.user.userId).catch(() => {});
    const count = await prisma.notification.count({
      where: { userId: req.user.userId, isRead: false },
    });
    return success(res, { count });
  } catch (err) { next(err); }
});

router.get('/', async (req: any, res, next) => {
  try {
    await pruneStaleLowStockNotifications(req.user.userId).catch(() => {});
    const { page, limit, skip } = getPagination(req);
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: req.user.userId },
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where: { userId: req.user.userId } }),
    ]);
    return paginated(res, notifications, total, page, limit);
  } catch (err) { next(err); }
});

router.patch('/read-all', async (req: any, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, isRead: false },
      data: { isRead: true },
    });
    return success(res, null, 'Notificaciones marcadas como leídas');
  } catch (err) { next(err); }
});

router.patch('/:id/read', async (req: any, res, next) => {
  try {
    // Verifica pertenencia al usuario autenticado antes de actualizar
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.userId },
      data: { isRead: true },
    });
    return success(res, null, 'Notificación leída');
  } catch (err) { next(err); }
});

export default router;
