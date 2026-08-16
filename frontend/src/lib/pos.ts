// Cálculos de dinero del POS. Se sacaron de la página (que pasa de las 1.300
// líneas) para poder probarlos: aquí se decide cuánto se descuenta, cuánto se
// devuelve de vueltas y cuándo se puede cerrar la venta. Un error acá se cobra
// de menos o se entrega mal el cambio, así que van cubiertos por pruebas.
//
// Los totales por línea (precio efectivo, DESC% e impuestos) NO están aquí: viven
// en store/cart.store.ts, que tiene sus propias pruebas.

/** Convierte lo que el cajero escribe en la casilla de descuento a pesos.
 *  `input` viene del teclado, así que puede traer texto o vacío. Nunca devuelve
 *  un descuento negativo ni mayor que la base — regalar la venta o dejar el
 *  total en negativo no es una operación válida. */
export function calcularDescuentoGlobal(input: string, mode: 'amount' | 'pct', base: number): number {
  const raw = Number(input) || 0;
  const amount = mode === 'pct' ? Math.round((base * raw) / 100) : Math.round(raw);
  return Math.max(0, Math.min(amount, Math.max(0, base)));
}

/** Vueltas a devolver. Nunca negativas: si el cliente entrega de menos, son 0
 *  (lo que falta se calcula con `faltantePorPagar`). */
export function calcularCambio(paidAmount: string, total: number): number {
  return Math.max(0, (parseFloat(paidAmount || '0') || 0) - total);
}

/** Lo que falta por cubrir del total. Nunca negativo. */
export function faltantePorPagar(total: number, pagado: number): number {
  return Math.max(0, total - pagado);
}

/** Suma de los pagos registrados en un pago MIXTO. */
export function sumarPagos(pagos: Array<{ amount: number }>): number {
  return pagos.reduce((suma, p) => suma + p.amount, 0);
}

export interface EstadoCobro {
  /** id del medio de pago, o 'MIXED' para pago dividido. */
  paymentMethod: string;
  /** Lo que escribió el cajero en "recibido". Vacío = paga justo el total. */
  paidAmount: string;
  total: number;
  /** Suma de los pagos del MIXTO. */
  mixedTotal: number;
  /** Venta fiada: se puede cerrar sin cubrir el total. */
  isCredit: boolean;
  /** La venta ya se está enviando al servidor. */
  enviando: boolean;
}

/** Monto que se registra como pagado en la venta. De este número salen las
 *  vueltas y, en un fiado, el saldo que queda debiendo el cliente:
 *  - MIXTO: la suma de los pagos registrados.
 *  - Fiado: solo lo que el cliente abonó (vacío = no abonó nada).
 *  - Contado: lo recibido, o el total exacto si el cajero no escribió nada. */
export function montoPagado(e: Pick<EstadoCobro, 'paymentMethod' | 'paidAmount' | 'total' | 'mixedTotal' | 'isCredit'>): number {
  if (e.paymentMethod === 'MIXED') return e.mixedTotal;
  const texto = e.isCredit ? e.paidAmount || '0' : e.paidAmount || String(e.total);
  const valor = parseFloat(texto);
  return isNaN(valor) ? 0 : valor;
}

/** ¿Se puede confirmar la venta? Bloquea el botón cuando el pago no alcanza,
 *  para no registrar una venta cobrada de menos. El fiado es la excepción: se
 *  cierra con lo que sea (incluso $0) porque el saldo queda como crédito. */
export function puedeConfirmarVenta(e: EstadoCobro): boolean {
  if (e.enviando) return false;
  if (e.isCredit) return true;
  if (e.paymentMethod === 'MIXED') return e.mixedTotal >= e.total;
  // Campo vacío = paga exacto: se compara el total contra sí mismo.
  const recibido = parseFloat(e.paidAmount || String(e.total));
  return !isNaN(recibido) && recibido >= e.total;
}
