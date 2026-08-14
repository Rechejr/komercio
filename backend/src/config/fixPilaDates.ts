import { prisma } from './database';
import { logger } from './logger';
import { periodosPila, periodosPilaLegacy, type PeriodoPila } from '../utils/pila';

// Los PILA generados antes del fix quedaron con el vencimiento en el MISMO mes
// del período; lo correcto es el mes SIGUIENTE (los aportes de agosto vencen en
// septiembre). Esto los corrige en la base al arrancar, para que no haya que
// correr un script a mano en cada entorno (dev y prod son bases distintas).
//
// Es CONSERVADOR a propósito: solo toca la fila si su fecha coincide EXACTAMENTE
// con la que habría calculado la regla vieja. Si el contador la editó a mano
// (las fechas de PILA son editables), se respeta. Por eso también es idempotente:
// una vez corregidas, las siguientes corridas no hacen nada.

const isoDay = (d: Date | string): string => new Date(d).toISOString().slice(0, 10);

export async function fixPilaDates(): Promise<number> {
  try {
    const vencs = await prisma.vencimiento.findMany({
      where: { obligacion: 'pila' },
      select: { id: true, periodo: true, fecha: true, taxClient: { select: { nit: true } } },
    });

    // Un NIT tiene 12 períodos: se cachea el cálculo por NIT + año.
    const cache = new Map<string, { correcto: PeriodoPila[]; viejo: PeriodoPila[] }>();
    let updated = 0;

    for (const v of vencs) {
      const nit = v.taxClient?.nit;
      const year = Number((v.periodo.match(/(\d{4})/) || [])[1]);
      if (!nit || !year) continue;

      const key = `${nit}|${year}`;
      let sets = cache.get(key);
      if (!sets) {
        sets = { correcto: periodosPila(nit, year), viejo: periodosPilaLegacy(nit, year) };
        cache.set(key, sets);
      }
      const correcto = sets.correcto.find((p) => p.periodo === v.periodo);
      const viejo = sets.viejo.find((p) => p.periodo === v.periodo);
      if (!correcto || !viejo) continue;

      const actual = isoDay(v.fecha);
      if (actual === isoDay(correcto.fecha)) continue; // ya está bien
      if (actual !== isoDay(viejo.fecha)) continue;    // editada a mano → no tocar

      await prisma.vencimiento.update({ where: { id: v.id }, data: { fecha: correcto.fecha } });
      updated += 1;
    }

    if (updated > 0) {
      logger.info(`[fix] PILA: ${updated} vencimiento(s) movido(s) al mes siguiente del período`);
    }
    return updated;
  } catch (err) {
    logger.warn(`[fix] fixPilaDates falló (no crítico): ${(err as { message?: string })?.message || err}`);
    return 0;
  }
}
