import cron from 'node-cron';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { notifyContableVencimientos } from '../services/notification.service';

// Notifica a las oficinas contables los vencimientos que YA vencieron o vencen en
// ≤5 días (no presentada/pagada), en la campanita y como push al móvil.
//
// El aviso se repite por HITO de la cuenta regresiva, no una sola vez en la vida
// del vencimiento: antes el contador recibía el aviso cuando faltaban 5 días y
// nunca más — ni el día que vencía, ni después de vencido.

const OBLIG_LABEL: Record<string, string> = {
  renta: 'Renta', iva: 'IVA', retefuente: 'Retención en la fuente', ica: 'ICA',
  exogena: 'Información exógena', pila: 'PILA', impoconsumo: 'Impoconsumo', simple: 'Régimen Simple',
};
const HREF: Record<string, string> = { pila: '/contable/pila', exogena: '/contable/exogena' };
const hrefDe = (obl: string) => HREF[obl] || '/contable/vencimientos';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fechaCorta = (d: Date) => `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;

/** Hoy en Colombia, como medianoche UTC del día-calendario (igual que el front). */
function hoyBogotaUTC(): number {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export async function run() {
  try {
    const hoy = hoyBogotaUTC();
    const limite = new Date(hoy + 6 * 86_400_000); // < inicio de hoy+6 = hasta hoy+5 inclusive

    const vencs = await prisma.vencimiento.findMany({
      where: {
        estado: { notIn: ['presentada', 'pagada'] },
        fecha: { lt: limite },
      },
      select: {
        id: true, obligacion: true, periodo: true, fecha: true,
        taxClient: { select: { razonSocial: true, businessId: true } },
      },
    });
    if (vencs.length === 0) return;

    const byBusiness = new Map<string, Array<{ id: string; titulo: string; mensaje: string; href: string; hito: string }>>();
    for (const v of vencs) {
      const businessId = v.taxClient?.businessId;
      if (!businessId) continue;
      const label = OBLIG_LABEL[v.obligacion] || v.obligacion;
      const cliente = v.taxClient!.razonSocial;
      const fechaDia = Date.UTC(v.fecha.getUTCFullYear(), v.fecha.getUTCMonth(), v.fecha.getUTCDate());
      const dias = Math.round((fechaDia - hoy) / 86_400_000);

      let titulo: string, mensaje: string;
      if (dias < 0) {
        const n = Math.abs(dias);
        titulo = `Vencido: ${label} de ${cliente}`;
        mensaje = `${label} · ${v.periodo} de ${cliente} venció hace ${n} día${n === 1 ? '' : 's'} (${fechaCorta(v.fecha)}).`;
      } else {
        titulo = `Por vencer: ${label} de ${cliente}`;
        mensaje = dias === 0
          ? `${label} · ${v.periodo} de ${cliente} vence HOY (${fechaCorta(v.fecha)}).`
          : `${label} · ${v.periodo} de ${cliente} vence en ${dias} día${dias === 1 ? '' : 's'} (${fechaCorta(v.fecha)}).`;
      }

      // Etapa de la cuenta regresiva. Cada una avisa una vez: así el contador
      // recibe el recordatorio cuando se acerca, el día del vencimiento, y
      // cuando ya se le pasó.
      const hito = dias < 0 ? 'vencido' : dias === 0 ? 'hoy' : dias <= 2 ? 'cerca' : 'previo';

      const list = byBusiness.get(businessId) ?? [];
      list.push({ id: v.id, titulo, mensaje, href: hrefDe(v.obligacion), hito });
      byBusiness.set(businessId, list);
    }

    let total = 0;
    for (const [businessId, items] of byBusiness) {
      const n = await notifyContableVencimientos(businessId, items).catch((err) => {
        logger.error(`[cron] notif vencimientos contable (businessId=${businessId}): ${err?.message || err}`);
        return 0;
      });
      total += n || 0;
    }
    if (total > 0) logger.info(`[cron] contableVencimientos: ${total} notificación(es) nueva(s)`);
  } catch (err) {
    logger.error('[cron] contableVencimientos falló:', err);
  }
}

export function startContableVencimientosJob() {
  // Diario 7am Colombia (12:00 UTC).
  cron.schedule('0 12 * * *', run);
  // Una pasada al arrancar para poblar de una (el dedup evita duplicados).
  setTimeout(() => { run().catch(() => {}); }, 15_000);
  logger.info('[cron] contableVencimientos registrado — diario 7am (Colombia) + al arranque');
}
