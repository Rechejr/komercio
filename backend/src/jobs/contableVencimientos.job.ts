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

/** Hora (0-23) en Colombia ahora mismo. */
export function horaBogota(): number {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Bogota', hour: '2-digit', hour12: false,
  }).format(new Date()));
}

/** Qué tipo de aviso toca según la posición de la hora en la lista del contador:
 *  la primera del día es el panorama, la última el cierre, y las de en medio
 *  recuerdan lo que sigue pendiente. Con una sola hora, siempre panorama. */
export function momentoDelAviso(horas: number[], hora: number): 'panorama' | 'pendientes' | 'cierre' {
  const orden = [...horas].sort((a, b) => a - b);
  if (orden.length <= 1 || hora === orden[0]) return 'panorama';
  if (hora === orden[orden.length - 1]) return 'cierre';
  return 'pendientes';
}

/** Hoy en Colombia, como medianoche UTC del día-calendario (igual que el front). */
function hoyBogotaUTC(): number {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export async function run(horaActual?: number) {
  try {
    const hora = horaActual ?? horaBogota();

    // Solo las oficinas que pidieron aviso a ESTA hora. Si ninguna, la corrida
    // termina aquí sin tocar la tabla de vencimientos.
    const oficinas = await prisma.business.findMany({
      where: { type: 'contable', deletedAt: null, vencAvisoHoras: { has: hora } },
      select: { id: true, vencAvisoHoras: true },
    });
    if (oficinas.length === 0) return;
    const horasPorOficina = new Map(oficinas.map((o) => [o.id, o.vencAvisoHoras]));

    const hoy = hoyBogotaUTC();
    const limite = new Date(hoy + 6 * 86_400_000); // < inicio de hoy+6 = hasta hoy+5 inclusive

    const vencs = await prisma.vencimiento.findMany({
      where: {
        estado: { notIn: ['presentada', 'pagada', 'no_aplica'] },
        fecha: { lt: limite },
        taxClient: { businessId: { in: oficinas.map((o) => o.id) } },
      },
      select: {
        id: true, obligacion: true, periodo: true, fecha: true,
        taxClient: { select: { razonSocial: true, businessId: true } },
      },
    });
    if (vencs.length === 0) return;

    const byBusiness = new Map<string, Array<{ id: string; titulo: string; mensaje: string; href: string; hito: string; dias: number }>>();
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
      list.push({ id: v.id, titulo, mensaje, href: hrefDe(v.obligacion), hito, dias });
      byBusiness.set(businessId, list);
    }

    let total = 0;
    for (const [businessId, items] of byBusiness) {
      const momento = momentoDelAviso(horasPorOficina.get(businessId) ?? [hora], hora);
      const n = await notifyContableVencimientos(businessId, items, momento, hora).catch((err) => {
        logger.error(`[cron] notif vencimientos contable (businessId=${businessId}): ${err?.message || err}`);
        return 0;
      });
      total += n || 0;
    }
    if (total > 0) logger.info(`[cron] contableVencimientos (${hora}h): ${total} notificación(es) nueva(s)`);
  } catch (err) {
    logger.error('[cron] contableVencimientos falló:', err);
  }
}

export function startContableVencimientosJob() {
  // Cada hora en punto: adentro se filtra qué oficinas pidieron aviso a esa hora.
  // Antes era una sola corrida diaria a las 7am para todo el mundo; ahora cada
  // contador elige su jornada (por defecto 7am, 2pm y 6pm).
  cron.schedule('0 * * * *', () => { run().catch(() => {}); });
  // Una pasada al arrancar para poblar la campanita de una (el dedup evita
  // duplicados, y el push respeta la franja: no suena fuera de horario).
  setTimeout(() => { run().catch(() => {}); }, 15_000);
  logger.info('[cron] contableVencimientos registrado — cada hora, según el horario de cada oficina');
}
