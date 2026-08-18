import webpush from 'web-push';
import { prisma } from './database';
import { logger } from './logger';

// .trim() defensivo: al pegar las llaves en el panel de Railway es facilísimo
// arrastrar un espacio o un salto de línea. Con la privada, la firma sale mal;
// con la PÚBLICA es peor, porque el navegador la usa como applicationServerKey y
// la suscripción falla en silencio — el usuario cree que activó los avisos y
// nunca le llega nada. Mismo criterio que ya se usa con las llaves de Wompi.
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = (process.env.VAPID_SUBJECT || '').trim();

// Web Push es OPCIONAL: si no hay claves VAPID, todo queda en no-op (igual que
// Redis/Cloudinary). Así el entorno sin configurar no rompe nada.
export const pushEnabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:soporte@ventrix.lat', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  logger.info('Web Push habilitado (VAPID configurado)');
} else {
  // Que quede dicho en el arranque: si no, el único síntoma es que nadie recibe
  // notificaciones y no hay ni una línea en los logs que lo explique.
  logger.warn('Web Push DESHABILITADO: faltan VAPID_PUBLIC_KEY o VAPID_PRIVATE_KEY — nadie recibirá avisos al celular');
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
interface SuscripcionGuardada { id: string; endpoint: string; p256dh: string; auth: string }

/** Envía a una lista de suscripciones y limpia las que ya no sirven. `borrar`
 *  recibe el id de la fila muerta, porque usuarios y vendedoras guardan sus
 *  suscripciones en tablas distintas. */
async function enviar(
  subs: SuscripcionGuardada[],
  payload: PushPayload,
  borrar: (id: string) => Promise<unknown>,
): Promise<void> {
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
        // 404/410 = la suscripción ya no existe en el navegador.
        // 403 = se creó con OTRA llave VAPID (pasa si las llaves se regeneran):
        // esa suscripción no va a funcionar nunca más, así que se borra para que
        // el usuario pueda volver a activar y no quede fallando en silencio.
        if (code === 404 || code === 410 || code === 403) {
          await borrar(s.id).catch(() => {});
          if (code === 403) {
            logger.warn('Web push: suscripción creada con una llave VAPID distinta — se elimina; hay que activar de nuevo');
          }
        } else {
          logger.warn(`Web push falló (status ${code ?? 'desconocido'})`);
        }
      }
    }),
  );
}

export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  if (!pushEnabled || userIds.length === 0) return;
  const subs = await prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
  if (subs.length === 0) return;
  await enviar(subs, payload, (id) => prisma.pushSubscription.delete({ where: { id } }));
}

/** Avisa a las vendedoras en su celular (portal /vendedor), aunque lo tengan
 *  cerrado: es lo que les permite escribirle al cliente recién comprado. */
export async function sendPushToSellers(sellerIds: string[], payload: PushPayload): Promise<void> {
  if (!pushEnabled || sellerIds.length === 0) return;
  const subs = await prisma.sellerPushSubscription.findMany({ where: { sellerId: { in: sellerIds } } });
  if (subs.length === 0) return;
  await enviar(subs, payload, (id) => prisma.sellerPushSubscription.delete({ where: { id } }));
}
