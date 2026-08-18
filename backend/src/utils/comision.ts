import { PLAN_PRICES, CONTABLE_ANNUAL_PRICE } from '../controllers/payment.controller';

// Comisión de las vendedoras: 30% del PRIMER pago, con tope de $40.000 en los
// planes anuales (si no, un anual de $287.000 pagaría $86.100 de una).
//
// Esta es la ÚNICA fuente de la cifra. Antes el cálculo vivía solo en el
// navegador del portal de vendedoras: ellas veían un número que el servidor no
// conocía, así que no había contra qué liquidar.
export const COMMISSION_RATE = 0.3;
export const ANNUAL_CAP = 40000;

export interface DatosPlan {
  periodo: 'Mensual' | 'Trimestral' | 'Anual';
  precio: number;
  comision: number;
}

export function comisionDe(precio: number, esAnual: boolean): number {
  const bruta = Math.round(precio * COMMISSION_RATE);
  return esAnual ? Math.min(bruta, ANNUAL_CAP) : bruta;
}

/** Plan de una cuenta a partir del monto realmente pagado, cuando se conoce. */
export function planDesdeMonto(amount: number, productType: string): DatosPlan {
  const esContable = productType === 'contable';
  const esAnual = esContable || amount >= PLAN_PRICES.annual;
  const periodo: DatosPlan['periodo'] = esAnual
    ? 'Anual'
    : amount >= PLAN_PRICES.quarterly ? 'Trimestral' : 'Mensual';
  return { periodo, precio: amount, comision: comisionDe(amount, esAnual) };
}

/** Plan deducido de la DURACIÓN del plan, para las cuentas creadas a mano por la
 *  vendedora (ahí no queda registrado el monto, solo el pago verificado en
 *  Wompi). Mismo criterio que usaba el portal. */
export function planDesdeDuracion(
  negocio: { type: string; createdAt: Date; planExpiresAt: Date | null },
): DatosPlan {
  const creado = negocio.createdAt.getTime();
  const expira = negocio.planExpiresAt ? negocio.planExpiresAt.getTime() : creado;
  const meses = Math.max(1, Math.round((expira - creado) / (30 * 24 * 60 * 60 * 1000)));

  if (negocio.type === 'contable') {
    return { periodo: 'Anual', precio: CONTABLE_ANNUAL_PRICE, comision: comisionDe(CONTABLE_ANNUAL_PRICE, true) };
  }
  if (meses >= 12) {
    return { periodo: 'Anual', precio: PLAN_PRICES.annual, comision: comisionDe(PLAN_PRICES.annual, true) };
  }
  if (meses >= 3) {
    return { periodo: 'Trimestral', precio: PLAN_PRICES.quarterly, comision: comisionDe(PLAN_PRICES.quarterly, false) };
  }
  return { periodo: 'Mensual', precio: PLAN_PRICES.monthly, comision: comisionDe(PLAN_PRICES.monthly, false) };
}
