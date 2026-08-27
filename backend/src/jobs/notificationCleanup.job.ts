import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

// La campanita no se limpiaba nunca. Con tres avisos diarios por oficina, más
// los del POS (stock bajo, fiados por vencer), la tabla solo crecía — y no es
// solo espacio: el dedup de los avisos lee las notificaciones existentes del
// usuario en cada corrida, así que cuantas más hay, más lento avisa.
//
// Se borra por antigüedad, con dos plazos distintos:
//
//   Leídas (60 días)      — ya cumplieron su función. El contador las vio.
//   No leídas (180 días)  — nadie las va a leer ya. A esa altura el evento
//                           que las originó ni existe: los vencimientos
//                           cumplidos se purgan a los 2 meses.
//
// El plazo largo para las no leídas es a propósito: borrar un aviso que nadie
// vio es más delicado que borrar uno ya visto, y quien entra poco a la
// aplicación no debería perder avisos por estar de vacaciones.
const DIAS_LEIDAS = 60;
const DIAS_SIN_LEER = 180;
const DIA_MS = 24 * 60 * 60 * 1000;

export async function limpiarNotificaciones(): Promise<{ leidas: number; sinLeer: number }> {
  const corteLeidas = new Date(Date.now() - DIAS_LEIDAS * DIA_MS);
  const corteSinLeer = new Date(Date.now() - DIAS_SIN_LEER * DIA_MS);

  const leidas = await prisma.notification.deleteMany({
    where: { isRead: true, createdAt: { lt: corteLeidas } },
  });
  const sinLeer = await prisma.notification.deleteMany({
    where: { isRead: false, createdAt: { lt: corteSinLeer } },
  });

  return { leidas: leidas.count, sinLeer: sinLeer.count };
}

export function startNotificationCleanupJob() {
  // Domingos a las 08:00 UTC = 3:00 a.m. en Colombia. Una vez por semana basta:
  // el problema es la acumulación de meses, no la del día.
  cron.schedule('0 8 * * 0', () => {
    limpiarNotificaciones()
      .then(({ leidas, sinLeer }) => {
        const total = leidas + sinLeer;
        if (total > 0) {
          logger.info(`[cron] notificaciones: ${total} borrada(s) — ${leidas} leídas, ${sinLeer} sin leer`);
        }
      })
      // No debe tumbar nada: es limpieza, no una función del producto.
      .catch((err) => logger.warn(`[cron] limpieza de notificaciones falló: ${(err as Error).message}`));
  });

  logger.info('[cron] notificaciones registrado — limpieza semanal');
}
