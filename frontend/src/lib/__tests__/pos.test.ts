import { describe, it, expect } from 'vitest';
import {
  calcularDescuentoGlobal, calcularCambio, faltantePorPagar, sumarPagos,
  puedeConfirmarVenta, montoPagado, type EstadoCobro,
} from '../pos';

describe('calcularDescuentoGlobal', () => {
  it('toma el monto en pesos tal cual', () => {
    expect(calcularDescuentoGlobal('5000', 'amount', 30000)).toBe(5000);
  });

  it('calcula el porcentaje sobre la base y redondea a pesos', () => {
    expect(calcularDescuentoGlobal('10', 'pct', 30000)).toBe(3000);
    expect(calcularDescuentoGlobal('15', 'pct', 19900)).toBe(2985);
    expect(calcularDescuentoGlobal('33', 'pct', 10000)).toBe(3300);
  });

  it('nunca descuenta más que el total de la venta', () => {
    // El cajero escribe 50.000 de descuento sobre una venta de 30.000: se topa.
    expect(calcularDescuentoGlobal('50000', 'amount', 30000)).toBe(30000);
    expect(calcularDescuentoGlobal('150', 'pct', 30000)).toBe(30000);
  });

  it('ignora valores negativos (no sube el total)', () => {
    expect(calcularDescuentoGlobal('-5000', 'amount', 30000)).toBe(0);
    expect(calcularDescuentoGlobal('-10', 'pct', 30000)).toBe(0);
  });

  it('trata como cero el campo vacío o con texto', () => {
    expect(calcularDescuentoGlobal('', 'amount', 30000)).toBe(0);
    expect(calcularDescuentoGlobal('abc', 'amount', 30000)).toBe(0);
    expect(calcularDescuentoGlobal('', 'pct', 30000)).toBe(0);
  });

  it('con el carrito vacío el descuento es cero', () => {
    expect(calcularDescuentoGlobal('5000', 'amount', 0)).toBe(0);
    expect(calcularDescuentoGlobal('20', 'pct', 0)).toBe(0);
  });

  it('el 100% deja la venta en cero, no en negativo', () => {
    expect(calcularDescuentoGlobal('100', 'pct', 19900)).toBe(19900);
  });
});

describe('calcularCambio', () => {
  it('devuelve las vueltas', () => {
    expect(calcularCambio('50000', 30000)).toBe(20000);
    expect(calcularCambio('30000', 30000)).toBe(0);
  });

  it('no devuelve vueltas negativas si el cliente entrega de menos', () => {
    expect(calcularCambio('10000', 30000)).toBe(0);
  });

  it('trata el campo vacío o inválido como cero recibido', () => {
    expect(calcularCambio('', 30000)).toBe(0);
    expect(calcularCambio('abc', 30000)).toBe(0);
  });
});

describe('faltantePorPagar / sumarPagos', () => {
  it('suma los pagos del pago dividido', () => {
    expect(sumarPagos([{ amount: 10000 }, { amount: 5500 }])).toBe(15500);
    expect(sumarPagos([])).toBe(0);
  });

  it('dice cuánto falta para cubrir el total', () => {
    expect(faltantePorPagar(30000, 10000)).toBe(20000);
    expect(faltantePorPagar(30000, 30000)).toBe(0);
  });

  it('no reporta faltante cuando se pagó de más', () => {
    expect(faltantePorPagar(30000, 45000)).toBe(0);
  });
});

describe('montoPagado — lo que se registra en la venta', () => {
  const base = {
    paymentMethod: 'acct-efectivo', paidAmount: '', total: 30000,
    mixedTotal: 0, isCredit: false,
  };

  it('contado con el campo vacío: se registra el total exacto', () => {
    expect(montoPagado(base)).toBe(30000);
  });

  it('contado: se registra lo recibido, aunque sea más que el total', () => {
    expect(montoPagado({ ...base, paidAmount: '50000' })).toBe(50000);
  });

  it('fiado sin abono: se registra 0, no el total', () => {
    // Si aquí se colara el total, el fiado nacería en cero y el cliente no
    // quedaría debiendo nada.
    expect(montoPagado({ ...base, isCredit: true })).toBe(0);
  });

  it('fiado con abono: se registra solo el abono', () => {
    expect(montoPagado({ ...base, isCredit: true, paidAmount: '10000' })).toBe(10000);
  });

  it('mixto: se registra la suma de los pagos, no el campo de recibido', () => {
    expect(montoPagado({ ...base, paymentMethod: 'MIXED', mixedTotal: 30000, paidAmount: '999' })).toBe(30000);
  });

  it('nunca devuelve NaN', () => {
    expect(montoPagado({ ...base, paidAmount: 'abc' })).toBe(0);
  });
});

describe('puedeConfirmarVenta', () => {
  const base: EstadoCobro = {
    paymentMethod: 'acct-efectivo', paidAmount: '', total: 30000,
    mixedTotal: 0, isCredit: false, enviando: false,
  };

  it('permite cerrar cuando el campo va vacío (paga exacto)', () => {
    expect(puedeConfirmarVenta(base)).toBe(true);
  });

  it('permite cerrar si entrega igual o más', () => {
    expect(puedeConfirmarVenta({ ...base, paidAmount: '30000' })).toBe(true);
    expect(puedeConfirmarVenta({ ...base, paidAmount: '50000' })).toBe(true);
  });

  it('BLOQUEA si el cliente entrega de menos', () => {
    // Este es el que evita registrar una venta cobrada por debajo del total.
    expect(puedeConfirmarVenta({ ...base, paidAmount: '29999' })).toBe(false);
    expect(puedeConfirmarVenta({ ...base, paidAmount: '0' })).toBe(false);
  });

  it('en pago mixto exige que los pagos cubran el total', () => {
    const mixto = { ...base, paymentMethod: 'MIXED' };
    expect(puedeConfirmarVenta({ ...mixto, mixedTotal: 29000 })).toBe(false);
    expect(puedeConfirmarVenta({ ...mixto, mixedTotal: 30000 })).toBe(true);
    expect(puedeConfirmarVenta({ ...mixto, mixedTotal: 35000 })).toBe(true);
  });

  it('el fiado se puede cerrar sin pagar (el saldo queda como crédito)', () => {
    expect(puedeConfirmarVenta({ ...base, isCredit: true, paidAmount: '0' })).toBe(true);
    expect(puedeConfirmarVenta({ ...base, isCredit: true, paidAmount: '10000' })).toBe(true);
    expect(puedeConfirmarVenta({ ...base, paymentMethod: 'MIXED', isCredit: true, mixedTotal: 0 })).toBe(true);
  });

  it('bloquea mientras la venta se está enviando (evita el doble cobro)', () => {
    expect(puedeConfirmarVenta({ ...base, enviando: true })).toBe(false);
    expect(puedeConfirmarVenta({ ...base, isCredit: true, enviando: true })).toBe(false);
  });

  it('bloquea si el campo de recibido trae texto', () => {
    expect(puedeConfirmarVenta({ ...base, paidAmount: 'abc' })).toBe(false);
  });
});

// ─── Anticipos en el cobro ────────────────────────────────────────────────────
//
// El caso: el cliente dejó plata antes para apartar mercancía. Esa plata ya la
// recibió el negocio, así que hoy solo se le cobra la diferencia. Si el cobro
// pidiera el total otra vez, se le estaría cobrando dos veces lo mismo.
describe('cobro con anticipo del cliente', () => {
  const base: EstadoCobro = {
    paymentMethod: 'acct-efectivo', paidAmount: '', total: 30000,
    mixedTotal: 0, isCredit: false, enviando: false,
  };

  it('con el campo vacío se cobra la diferencia, no el total', () => {
    expect(montoPagado({ ...base, anticipo: 20000 })).toBe(10000);
  });

  it('si el anticipo cubre todo, no hay nada que cobrar', () => {
    expect(montoPagado({ ...base, anticipo: 30000 })).toBe(0);
    expect(puedeConfirmarVenta({ ...base, anticipo: 30000 })).toBe(true);
  });

  it('un anticipo mayor que la factura no deja el cobro en negativo', () => {
    expect(montoPagado({ ...base, anticipo: 50000 })).toBe(0);
  });

  it('se confirma cuando lo recibido cubre la diferencia', () => {
    expect(puedeConfirmarVenta({ ...base, anticipo: 20000, paidAmount: '9000' })).toBe(false);
    expect(puedeConfirmarVenta({ ...base, anticipo: 20000, paidAmount: '10000' })).toBe(true);
    expect(puedeConfirmarVenta({ ...base, anticipo: 20000, paidAmount: '20000' })).toBe(true);
  });

  it('en pago mixto los métodos suman solo la diferencia', () => {
    const mixto = { ...base, paymentMethod: 'MIXED', anticipo: 20000 };
    expect(puedeConfirmarVenta({ ...mixto, mixedTotal: 9000 })).toBe(false);
    expect(puedeConfirmarVenta({ ...mixto, mixedTotal: 10000 })).toBe(true);
  });

  it('sin anticipo todo funciona igual que antes', () => {
    expect(montoPagado(base)).toBe(30000);
    expect(montoPagado({ ...base, anticipo: 0 })).toBe(30000);
    expect(puedeConfirmarVenta({ ...base, paidAmount: '29000' })).toBe(false);
  });

  it('en un fiado el anticipo no cambia lo que el cliente abona hoy', () => {
    // El abono es lo que escribió el cajero; el resto queda como saldo.
    expect(montoPagado({ ...base, isCredit: true, anticipo: 20000, paidAmount: '5000' })).toBe(5000);
  });
});
