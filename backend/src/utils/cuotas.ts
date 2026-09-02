import { Prisma } from '@prisma/client';

// Venta a cuotas de un fiado.
//
// Reglas acordadas con el negocio (mueblería, 2026-09-02):
//  · El valor de cada cuota lo define el vendedor. El sistema PROPONE un reparto
//    parejo, pero él puede ajustarlo — es común una primera más alta o redondear
//    la última para que no queden centavos.
//  · El interés es de FINANCIACIÓN: se cobra por dar el plazo, se calcula sobre
//    el saldo y se suma desde el principio, de modo que el cliente sabe el total
//    a pagar desde el primer día. No es un recargo por atraso.
//  · Las cuotas vencen mensualmente.

// Tope de cuotas. Generoso para muebles (3 años), pero atajando el dedazo de
// escribir 500 y generar quinientas filas por error.
export const MAX_CUOTAS = 36;

/** Hoy a medianoche UTC — base para calcular los vencimientos por día calendario. */
export function hoyUTC(): Date {
  const h = new Date();
  return new Date(Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate()));
}

/** Interés simple: capital × tasa mensual × número de meses. */
export function calcularInteres(saldo: number, tasaMensual: number, numCuotas: number): number {
  if (!(saldo > 0) || !(tasaMensual > 0) || !(numCuotas > 0)) return 0;
  return Math.round(saldo * (tasaMensual / 100) * numCuotas);
}

/**
 * Reparte un total en N cuotas parejas, en pesos enteros.
 *
 * El sobrante de la división NO se pierde ni deja centavos: se suma a la ÚLTIMA
 * cuota. Así la suma de las cuotas es exactamente el total — si no, el cliente
 * terminaría de pagar y quedaría debiendo $2 para siempre.
 */
export function repartirCuotas(total: number, numCuotas: number): number[] {
  if (numCuotas <= 0) return [];
  const base = Math.floor(total / numCuotas);
  const cuotas = Array(numCuotas).fill(base);
  cuotas[numCuotas - 1] = total - base * (numCuotas - 1);
  return cuotas;
}

/**
 * Fechas de vencimiento mensuales a partir de la primera.
 *
 * Se conserva el día del mes; si ese día no existe en el mes siguiente (un 31 en
 * febrero), cae al último día de ese mes en vez de saltar al 1 del otro, que es
 * lo que haría el cálculo ingenuo de sumar meses.
 */
export function fechasMensuales(primera: Date, numCuotas: number): Date[] {
  const dia = primera.getUTCDate();
  const fechas: Date[] = [];
  for (let i = 0; i < numCuotas; i++) {
    const y = primera.getUTCFullYear();
    const m = primera.getUTCMonth() + i;
    const anio = y + Math.floor(m / 12);
    const mes = ((m % 12) + 12) % 12;
    const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
    fechas.push(new Date(Date.UTC(anio, mes, Math.min(dia, ultimoDia))));
  }
  return fechas;
}

export interface PlanCuota {
  numero: number;
  monto: number;
  dueDate: Date;
}

/**
 * Arma el plan completo. `montos` permite pasar los valores ya ajustados a mano;
 * si no viene, se reparten parejos.
 */
export function armarPlan(
  saldo: number,
  numCuotas: number,
  tasaMensual: number,
  primeraFecha: Date,
  montos?: number[],
): { cuotas: PlanCuota[]; interes: number; total: number } {
  const interes = calcularInteres(saldo, tasaMensual, numCuotas);
  const total = saldo + interes;
  const valores = montos && montos.length === numCuotas ? montos : repartirCuotas(total, numCuotas);
  const fechas = fechasMensuales(primeraFecha, numCuotas);
  return {
    cuotas: valores.map((monto, i) => ({ numero: i + 1, monto, dueDate: fechas[i] })),
    interes,
    total,
  };
}

/** Estado de una cuota según lo abonado. */
export function estadoCuota(monto: number, pagado: number): 'PENDING' | 'PARTIAL' | 'PAID' {
  if (pagado <= 0) return 'PENDING';
  // Tolerancia de un peso: los redondeos no deben dejar una cuota "casi pagada"
  // para siempre.
  if (pagado >= monto - 1) return 'PAID';
  return 'PARTIAL';
}

/** Suma de montos como número, para comparar contra el total sin líos de Decimal. */
export const aNumero = (v: Prisma.Decimal | number | string | null | undefined): number =>
  Math.round(Number(v || 0));
