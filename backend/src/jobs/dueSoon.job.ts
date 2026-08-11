import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { notifyDueSoonBatch } from '../services/notification.service';

const DAYS_AHEAD = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// "faltan N días" en lenguaje natural.
function cuando(dias: number): string {
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return `en ${dias} días`;
}

function diasRestantes(dueDate: Date, now: Date): number {
  return Math.max(0, Math.ceil((dueDate.getTime() - now.getTime()) / DAY_MS));
}

const money = (v: unknown) => `$${Number(v || 0).toLocaleString('es-CO')}`;

// Avisa a los administradores del POS de las cuentas por COBRAR (fiados de
// clientes) y por PAGAR (a proveedores) que vencen dentro de los próximos 3
// días. El aviso de cada cuenta se genera UNA sola vez (dedup en el servicio),
// aunque el job corra a diario.
export function startDueSoonJob() {
  // 14:00 UTC = 9:00 a.m. en Colombia — a primera hora hábil, no de madrugada.
  cron.schedule('0 14 * * *', async () => {
    try {
      const now = new Date();
      const limite = new Date(now.getTime() + DAYS_AHEAD * DAY_MS);

      // ── Cuentas por COBRAR (fiados de clientes) ──────────────────────────
      const credits = await prisma.credit.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { gte: now, lte: limite },
          deletedAt: null,
        },
        select: {
          id: true, balance: true, dueDate: true,
          customer: { select: { name: true, businessId: true } },
        },
      });

      // ── Cuentas por PAGAR (a proveedores) ────────────────────────────────
      const payables = await prisma.supplierCredit.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { gte: now, lte: limite },
          deletedAt: null,
        },
        select: {
          id: true, balance: true, dueDate: true, businessId: true,
          supplier: { select: { name: true } },
        },
      });

      if (credits.length === 0 && payables.length === 0) return;

      // Agrupa por negocio para notificar en un solo lote por negocio.
      type Item = { refId: string; title: string; message: string; href: string };
      const cobrarByBiz = new Map<string, Item[]>();
      const pagarByBiz = new Map<string, Item[]>();

      for (const c of credits) {
        const businessId = c.customer?.businessId;
        if (!businessId || !c.dueDate) continue;
        const dias = diasRestantes(c.dueDate, now);
        const list = cobrarByBiz.get(businessId) ?? [];
        list.push({
          refId: c.id,
          title: 'Fiado por vencer',
          message: `El fiado de ${c.customer?.name || 'un cliente'} vence ${cuando(dias)} — saldo ${money(c.balance)}.`,
          href: '/creditos',
        });
        cobrarByBiz.set(businessId, list);
      }

      for (const p of payables) {
        if (!p.businessId || !p.dueDate) continue;
        const dias = diasRestantes(p.dueDate, now);
        const list = pagarByBiz.get(p.businessId) ?? [];
        list.push({
          refId: p.id,
          title: 'Cuenta por pagar próxima',
          message: `La cuenta con ${p.supplier?.name || 'un proveedor'} vence ${cuando(dias)} — saldo ${money(p.balance)}.`,
          href: '/cuentas-por-pagar',
        });
        pagarByBiz.set(p.businessId, list);
      }

      let avisos = 0;
      for (const [businessId, items] of cobrarByBiz) {
        avisos += await notifyDueSoonBatch(businessId, 'CREDIT_DUE_SOON', items).catch((err) => {
          logger.error(`[cron] dueSoon (cobrar) businessId=${businessId}: ${err?.message || err}`);
          return 0;
        });
      }
      for (const [businessId, items] of pagarByBiz) {
        avisos += await notifyDueSoonBatch(businessId, 'PAYABLE_DUE_SOON', items).catch((err) => {
          logger.error(`[cron] dueSoon (pagar) businessId=${businessId}: ${err?.message || err}`);
          return 0;
        });
      }

      if (avisos > 0) logger.info(`[cron] dueSoon: ${avisos} aviso(s) de vencimiento próximo generados`);
    } catch (err) {
      logger.error('[cron] dueSoon falló:', err);
    }
  });

  logger.info('[cron] dueSoon registrado — corre a diario 9:00 a.m. (hora Colombia)');
}
