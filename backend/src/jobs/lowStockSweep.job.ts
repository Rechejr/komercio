import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { notifyLowStockBatch } from '../services/notification.service';

type LowRow = { id: string; name: string; stock: number; minStock: number; businessId: string };

// Barrido diario de stock bajo. La alerta por venta/ajuste solo se dispara al
// CRUZAR el mínimo por un movimiento; este job cubre lo que se queda quieto:
// productos que ya están en o por debajo de su mínimo y aún no se han avisado.
// Usa la misma bandera `lowStockNotifiedAt` (dedup) que el resto del flujo, así
// no se duplica y se resetea sola al reabastecer.
export function startLowStockSweepJob() {
  // 13:30 UTC = 8:30 a.m. en Colombia — a primera hora, antes de abrir.
  cron.schedule('30 13 * * *', async () => {
    try {
      // Prisma no compara columna-vs-columna en el where → SQL crudo (mismo patrón
      // que el conteo de stock bajo del dashboard).
      const flagged = await prisma.$queryRaw<LowRow[]>`
        SELECT id, name, stock, "minStock", "businessId"
        FROM products
        WHERE "deletedAt" IS NULL
          AND "minStock" > 0
          AND "lowStockNotifiedAt" IS NULL
          AND stock <= "minStock"
      `;
      if (flagged.length === 0) return;

      // Marca notificados de una vez (dedup) para no reavisar en la próxima corrida.
      await prisma.product.updateMany({
        where: { id: { in: flagged.map((p) => p.id) } },
        data: { lowStockNotifiedAt: new Date() },
      });

      const byBiz = new Map<string, Array<{ id: string; name: string; stock: number; minStock: number }>>();
      for (const p of flagged) {
        if (!p.businessId) continue;
        const list = byBiz.get(p.businessId) ?? [];
        list.push({ id: p.id, name: p.name, stock: Number(p.stock), minStock: Number(p.minStock) });
        byBiz.set(p.businessId, list);
      }

      let total = 0;
      for (const [businessId, products] of byBiz) {
        total += products.length;
        await notifyLowStockBatch(businessId, products).catch((err) => {
          logger.error(`[cron] lowStockSweep businessId=${businessId}: ${err?.message || err}`);
        });
      }

      logger.info(`[cron] lowStockSweep: ${total} producto(s) con stock bajo notificados`);
    } catch (err) {
      logger.error('[cron] lowStockSweep falló:', err);
    }
  });

  logger.info('[cron] lowStockSweep registrado — corre a diario 8:30 a.m. (hora Colombia)');
}
