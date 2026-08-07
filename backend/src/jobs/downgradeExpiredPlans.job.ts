import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

// Cuando un plan Pro (POS) se vence, el acceso a las funciones Pro ya se corta
// solo (getBusinessWithPlan trata el vencido como gratuito), pero el campo `plan`
// seguía en "pro" → el panel y la app mostraban "Pro" aunque ya no lo fuera.
// Este proceso pone el campo en "free" al vencer, para que la etiqueta sea real
// en todos lados. Se limita a POS: la Agenda contable gestiona su vigencia por
// planExpiresAt (requireActiveContable), no por este campo.
async function run() {
  try {
    const res = await prisma.business.updateMany({
      where: {
        type: 'pos',
        plan: 'pro',
        planExpiresAt: { not: null, lt: new Date() },
        deletedAt: null,
      },
      data: { plan: 'free' },
    });
    if (res.count > 0) {
      logger.info(`[cron] downgradeExpiredPlans: ${res.count} negocio(s) POS con Pro vencido → gratuito`);
    }
  } catch (err) {
    logger.warn('[cron] downgradeExpiredPlans falló: ' + (err as Error).message);
  }
}

export function startDowngradeExpiredPlansJob() {
  // Diario a la 1am UTC (barato; el vencimiento no es sensible a la hora exacta).
  cron.schedule('0 1 * * *', () => { run().catch(() => {}); });
  // Una pasada al arrancar: corrige de una los que ya estén vencidos.
  setTimeout(() => { run().catch(() => {}); }, 25_000);
  logger.info('[cron] downgradeExpiredPlans registrado — diario + al arranque');
}
