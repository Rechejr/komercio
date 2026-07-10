import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { notifyCreditsOverdueBatch } from '../services/notification.service';
import { emitToBusinesss, socketEvents } from '../config/socket';

export function startCreditOverdueJob() {
  // Runs at the top of every hour — marks PENDING/PARTIAL credits past dueDate as OVERDUE
  // and notifica a los administradores del negocio (antes solo cambiaba el estado en
  // silencio; nadie se enteraba de un fiado vencido salvo que entrara a filtrar).
  cron.schedule('0 * * * *', async () => {
    try {
      const now = new Date();
      const toMarkOverdue = await prisma.credit.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { lt: now },
          deletedAt: null,
        },
        select: {
          id: true, balance: true,
          customer: { select: { name: true, businessId: true } },
        },
      });

      if (toMarkOverdue.length === 0) return;

      await prisma.credit.updateMany({
        where: { id: { in: toMarkOverdue.map((c) => c.id) } },
        data: { status: 'OVERDUE' },
      });

      const byBusiness = new Map<string, Array<{ id: string; customerName: string; balance: number }>>();
      for (const credit of toMarkOverdue) {
        const businessId = credit.customer?.businessId;
        if (!businessId) continue;
        const list = byBusiness.get(businessId) ?? [];
        list.push({ id: credit.id, customerName: credit.customer!.name, balance: Number(credit.balance) });
        byBusiness.set(businessId, list);
      }

      for (const [businessId, credits] of byBusiness) {
        emitToBusinesss(businessId, socketEvents.CREDIT_OVERDUE, { credits });
        await notifyCreditsOverdueBatch(businessId, credits).catch((err) => {
          logger.error(`[cron] Fallo al notificar créditos vencidos (businessId=${businessId}): ${err?.message || err}`);
        });
      }

      logger.info(`[cron] creditOverdue: ${toMarkOverdue.length} crédito(s) marcados como vencidos`);
    } catch (err) {
      logger.error('[cron] creditOverdue falló:', err);
    }
  });

  logger.info('[cron] creditOverdue registrado — corre cada hora en el minuto 0');
}