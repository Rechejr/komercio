import {
  calcularInteres, repartirCuotas, fechasMensuales, armarPlan, estadoCuota,
} from '../../utils/cuotas';

// Aquí se reparte plata de clientes reales. Un peso perdido en el redondeo deja
// un fiado que nunca termina de pagarse, y una fecha mal calculada le cambia el
// día de pago a alguien. Por eso se prueba con los números del caso real.

describe('calcularInteres', () => {
  it('cobra el interés por cada mes de plazo', () => {
    // El ejemplo acordado: $800.000 a 4 meses al 2% mensual.
    expect(calcularInteres(800_000, 2, 4)).toBe(64_000);
  });

  it('sin tasa no cobra nada', () => {
    expect(calcularInteres(800_000, 0, 4)).toBe(0);
  });

  it.each([
    ['saldo en cero', 0, 2, 4],
    ['tasa negativa', 800_000, -5, 4],
    ['sin cuotas', 800_000, 2, 0],
  ])('devuelve 0 con %s', (_caso, saldo, tasa, n) => {
    expect(calcularInteres(saldo, tasa, n)).toBe(0);
  });

  it('a más meses, más interés', () => {
    expect(calcularInteres(800_000, 2, 6)).toBeGreaterThan(calcularInteres(800_000, 2, 3));
  });
});

describe('repartirCuotas', () => {
  it('reparte parejo cuando la división es exacta', () => {
    expect(repartirCuotas(864_000, 4)).toEqual([216_000, 216_000, 216_000, 216_000]);
  });

  it('el sobrante va a la última cuota, no se pierde', () => {
    // 100.000 / 3 = 33.333,33. Sin este cuidado quedarían $1 sin cobrar y el
    // fiado nunca llegaría a saldarse.
    const cuotas = repartirCuotas(100_000, 3);
    expect(cuotas).toEqual([33_333, 33_333, 33_334]);
    expect(cuotas.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it.each([[3], [5], [7], [11], [13]])('la suma siempre cuadra con %i cuotas', (n) => {
    const total = 1_234_567;
    expect(repartirCuotas(total, n).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('con una sola cuota, esa cuota es el total', () => {
    expect(repartirCuotas(500_000, 1)).toEqual([500_000]);
  });
});

describe('fechasMensuales', () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  it('vencen el mismo día de cada mes', () => {
    const f = fechasMensuales(new Date(Date.UTC(2026, 9, 15)), 4);
    expect(f.map(iso)).toEqual(['2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15']);
  });

  it('cruza de año sin perderse', () => {
    const f = fechasMensuales(new Date(Date.UTC(2026, 10, 20)), 3);
    expect(f.map(iso)).toEqual(['2026-11-20', '2026-12-20', '2027-01-20']);
  });

  it('un 31 cae al último día del mes que no lo tiene', () => {
    // Sumar meses a lo bruto convertiría el 31 de enero en el 3 de marzo.
    const f = fechasMensuales(new Date(Date.UTC(2026, 0, 31)), 3);
    expect(f.map(iso)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('respeta el 29 de febrero en año bisiesto', () => {
    const f = fechasMensuales(new Date(Date.UTC(2028, 0, 29)), 2);
    expect(f.map(iso)).toEqual(['2028-01-29', '2028-02-29']);
  });
});

describe('armarPlan — el caso real de la mueblería', () => {
  it('venta de $1.000.000 con $200.000 de inicial, 4 cuotas al 2%', () => {
    const plan = armarPlan(800_000, 4, 2, new Date(Date.UTC(2026, 9, 15)));

    expect(plan.interes).toBe(64_000);
    expect(plan.total).toBe(864_000);
    expect(plan.cuotas.map((c) => c.monto)).toEqual([216_000, 216_000, 216_000, 216_000]);
    expect(plan.cuotas[0].dueDate.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(plan.cuotas[3].dueDate.toISOString().slice(0, 10)).toBe('2027-01-15');
  });

  it('sin interés, las cuotas suman exactamente el saldo', () => {
    const plan = armarPlan(800_000, 4, 0, new Date(Date.UTC(2026, 9, 15)));
    expect(plan.interes).toBe(0);
    expect(plan.cuotas.reduce((s, c) => s + c.monto, 0)).toBe(800_000);
  });

  it('acepta montos ajustados a mano (primera más alta)', () => {
    // Lo que pidió el negocio: poder definir el valor de cada cuota.
    const montos = [300_000, 200_000, 200_000, 164_000];
    const plan = armarPlan(800_000, 4, 2, new Date(Date.UTC(2026, 9, 15)), montos);
    expect(plan.cuotas.map((c) => c.monto)).toEqual(montos);
    expect(plan.cuotas.reduce((s, c) => s + c.monto, 0)).toBe(plan.total);
  });

  it('ignora un ajuste manual con cantidad equivocada de cuotas', () => {
    // Si llegan 3 montos para 4 cuotas, se reparte parejo en vez de armar un
    // plan incoherente.
    const plan = armarPlan(800_000, 4, 0, new Date(Date.UTC(2026, 9, 15)), [1, 2, 3]);
    expect(plan.cuotas).toHaveLength(4);
    expect(plan.cuotas.reduce((s, c) => s + c.monto, 0)).toBe(800_000);
  });
});

describe('estadoCuota', () => {
  it('sin abonos está pendiente', () => {
    expect(estadoCuota(216_000, 0)).toBe('PENDING');
  });

  it('con un abono parcial queda en abono parcial', () => {
    expect(estadoCuota(216_000, 100_000)).toBe('PARTIAL');
  });

  it('cubierta queda pagada', () => {
    expect(estadoCuota(216_000, 216_000)).toBe('PAID');
  });

  it('un peso de diferencia por redondeo la da por pagada', () => {
    // Si no, una cuota quedaría "casi pagada" para siempre por un centavo.
    expect(estadoCuota(216_000, 215_999)).toBe('PAID');
  });

  it('pagar de más también la deja pagada', () => {
    expect(estadoCuota(216_000, 300_000)).toBe('PAID');
  });
});
