// Cálculo del plan de cuotas para mostrarlo ANTES de confirmar la venta.
//
// Es un espejo de backend/src/utils/cuotas.ts: el servidor vuelve a calcular
// todo y es quien manda. Aquí se repite solo para que el vendedor vea el plan
// mientras lo arma, sin ir y volver al servidor en cada tecla.
//
// Si algún día cambian las reglas, hay que cambiarlas en los DOS lados — por eso
// las pruebas de ambos usan los mismos números.

export const MAX_CUOTAS = 36;

/** Interés simple de financiación: capital × tasa mensual × meses. */
export function calcularInteres(saldo: number, tasaMensual: number, numCuotas: number): number {
  if (!(saldo > 0) || !(tasaMensual > 0) || !(numCuotas > 0)) return 0;
  return Math.round(saldo * (tasaMensual / 100) * numCuotas);
}

/** Reparte un total en cuotas enteras; el sobrante va a la última. */
export function repartirCuotas(total: number, numCuotas: number): number[] {
  if (numCuotas <= 0) return [];
  const base = Math.floor(total / numCuotas);
  const cuotas = Array(numCuotas).fill(base);
  cuotas[numCuotas - 1] = total - base * (numCuotas - 1);
  return cuotas;
}

/** Fechas mensuales conservando el día; un 31 cae al último día del mes corto. */
export function fechasMensuales(primera: Date, numCuotas: number): Date[] {
  const dia = primera.getUTCDate();
  const out: Date[] = [];
  for (let i = 0; i < numCuotas; i++) {
    const m = primera.getUTCMonth() + i;
    const anio = primera.getUTCFullYear() + Math.floor(m / 12);
    const mes = ((m % 12) + 12) % 12;
    const ultimo = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    out.push(new Date(Date.UTC(anio, mes, Math.min(dia, ultimo))));
  }
  return out;
}

/** Fecha (AAAA-MM-DD) del mismo día del mes que viene — primera cuota por defecto. */
export function proximoMesISO(): string {
  const h = new Date();
  const f = fechasMensuales(new Date(Date.UTC(h.getFullYear(), h.getMonth(), h.getDate())), 2)[1];
  return f.toISOString().slice(0, 10);
}

export interface CuotaPlan { numero: number; monto: number; fecha: Date; }

export function armarPlan(
  saldo: number,
  numCuotas: number,
  tasaMensual: number,
  primeraISO: string,
  montos?: number[],
): { cuotas: CuotaPlan[]; interes: number; total: number } {
  const interes = calcularInteres(saldo, tasaMensual, numCuotas);
  const total = saldo + interes;
  const valores = montos && montos.length === numCuotas ? montos : repartirCuotas(total, numCuotas);
  // La fecha del input viene como AAAA-MM-DD: se lee en UTC para que no se corra
  // un día según la zona horaria del navegador.
  const [y, m, d] = (primeraISO || proximoMesISO()).split('-').map(Number);
  const fechas = fechasMensuales(new Date(Date.UTC(y, m - 1, d)), numCuotas);
  return {
    cuotas: valores.map((monto, i) => ({ numero: i + 1, monto, fecha: fechas[i] })),
    interes,
    total,
  };
}
