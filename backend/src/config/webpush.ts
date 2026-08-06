import webpush from 'web-push';
import { prisma } from './database';
import { logger } from './logger';

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

// Web Push es OPCIONAL: si no hay claves VAPID, todo queda en no-op (igual que
// Redis/Cloudinary). Así el entorno sin configurar no rompe nada.
export const pushEnabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:soporte@ventrix.lat', VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  logger.info('Web Push habilitado (VAPID configurado)');
}

export function getVapidPublicKey(): string | null {
  return VAPID_PUBLIC_KEY || null;
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// Envía un push a TODAS las suscripciones de los usuarios dados. Best-effort:
// si una suscripción expiró (404/410) se borra sola; nunca lanza para no romper
// el flujo que lo invoca (cron de vencimientos, etc.).
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!pushEnabled || userIds.length === 0) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (subs.length === 0) return;

  const data = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        // 404/410 = la suscripción ya no existe en el navegador → limpiarla.
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          logger.warn(`Web push falló (status ${code ?? 'desconocido'})`);
        }
      }
    }),
  );
}
