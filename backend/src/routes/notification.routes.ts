import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middlewares/auth';
import { success, paginated, AppError } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { pruneStaleLowStockNotifications } from '../services/notification.service';
import { getVapidPublicKey } from '../config/webpush';

const router = Router();
router.use(authenticate);

// ─── Web Push (notificaciones al móvil con la app cerrada) ────────────────────
// Clave pública VAPID que el navegador necesita para suscribirse. Pública por
// definición; se sirve desde el backend para no depender de una env del frontend.
router.get('/vapid-public-key', (_req, res) => {
  return success(res, { key: getVapidPublicKey() });
});

// Guarda (o actualiza) la suscripción push de este dispositivo para el usuario.
router.post('/subscribe', async (req: any, res, next) => {
  try {
    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) throw new AppError('Suscripción inválida', 400);
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: req.user.userId },
      // Si el mismo endpoint cambia de dueño (ej. otra sesión en el equipo), se reasigna.
      update: { p256dh: keys.p256dh, auth: keys.auth, userId: req.user.userId },
    });
    return success(res, null, 'Notificaciones activadas');
  } catch (err) { next(err); }
});

// Elimina la suscripción de este dispositivo (al desactivar avisos).
router.post('/unsubscribe', async (req: any, res, next) => {
  try {
    const { endpoint } = req.body || {};
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user.userId } });
    }
    return success(res, null, 'Notificaciones desactivadas');
  } catch (err) { next(err); }
});

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
