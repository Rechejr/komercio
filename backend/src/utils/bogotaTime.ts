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
