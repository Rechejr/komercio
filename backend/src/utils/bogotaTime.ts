// Colombia no observa horario de verano — UTC-5 todo el año — así que a
// diferencia del huso horario general, aquí sí se puede calcular con un offset
// fijo en vez de Intl/toLocaleString. El servidor corre en UTC (sin TZ seteada),
// así que "hoy" calculado con Date local del proceso quedaba corrido ~5 horas
// respecto al día calendario real en Bogotá.
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;

export function bogotaDayStart(date: Date, dayOffset = 0): Date {
  const shifted = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  const midnightShifted = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + dayOffset));
  return new Date(midnightShifted.getTime() + BOGOTA_OFFSET_MS);
}

export function bogotaMonthStart(date: Date, monthOffset = 0): Date {
  const shifted = new Date(date.getTime() - BOGOTA_OFFSET_MS);
  const firstOfMonthShifted = new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + monthOffset, 1));
  return new Date(firstOfMonthShifted.getTime() + BOGOTA_OFFSET_MS);
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Convierte un parámetro de fecha de la API en el instante exacto que le
 * corresponde al usuario en Colombia.
 *
 * - `"2026-07-25"` (solo fecha) → 00:00:00.000 o 23:59:59.999 de ESE día
 *   calendario en Bogotá. Interpretarla como UTC (lo que hace `new Date()`)
 *   corría el rango 5 horas: un reporte "del 25 al 29" arrancaba a las 7 p.m.
 *   del 24 y cortaba a las 7 p.m. del 29, perdiendo las ventas de esa noche.
 * - ISO completo → se respeta tal cual; el cliente ya calculó el instante.
 *
 * Devuelve `null` si el valor no es una fecha usable, para que quien llama
 * decida el valor por defecto.
 */
export function parseBogotaBoundary(value: unknown, boundary: 'start' | 'end'): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();

  if (DATE_ONLY_RE.test(raw)) {
    const utcMidnight = new Date(`${raw}T00:00:00.000Z`);
    if (isNaN(utcMidnight.getTime())) return null;
    // La medianoche de Bogotá ocurre 5 horas DESPUÉS de la medianoche UTC.
    const dayStart = new Date(utcMidnight.getTime() + BOGOTA_OFFSET_MS);
    return boundary === 'start' ? dayStart : new Date(dayStart.getTime() + DAY_MS - 1);
  }

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** "YYYY-MM-DD" del día calendario colombiano al que pertenece el instante. */
export function bogotaDateString(date: Date): string {
  return new Date(date.getTime() - BOGOTA_OFFSET_MS).toISOString().slice(0, 10);
}
