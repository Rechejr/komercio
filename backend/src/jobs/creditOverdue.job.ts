import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

export function startCreditOverdueJob() {
  // Runs at the top of every hour — marks PENDING/PARTIAL credits past dueDate as OVERDUE
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      const result = await prisma.credit.updateMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { lt: now },
          deletedAt: null,
        },
        data: { status: 'OVERDUE' },
      });
      if (result.count > 0) {
        logger.info(`[cron] creditOverdue: ${result.count} crédito(s) marcados como vencidos`);
      }
    } catch (err) {
      logger.error('[cron] creditOverdue falló:', err);
    }
  });

  logger.info('[cron] creditOverdue registrado — corre cada hora en el minuto 0');
}