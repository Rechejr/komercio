import { describe, it, expect } from 'vitest';
import { calcularInteres, repartirCuotas, fechasMensuales, armarPlan } from '../cuotas';

// Este cálculo es un espejo del backend. Se prueba con LOS MISMOS números que
// backend/src/__tests__/utils/cuotas.test.ts: si algún día los dos lados dejan
// de coincidir, el vendedor vería en pantalla un plan distinto al que se guarda.

describe('espejo del cálculo del backend', () => {
  it('el caso de la mueblería da lo mismo que en el servidor', () => {
    // $1.000.000 con $200.000 de inicial → financia $800.000, 4 cuotas al 2%.
    const plan = armarPlan(800_000, 4, 2, '2026-10-15');
    expect(plan.interes).toBe(64_000);
    expect(plan.total).toBe(864_000);
    expect(plan.cuotas.map((c) => c.monto)).toEqual([216_000, 216_000, 216_000, 216_000]);
  });

  it('el interés se calcula igual', () => {
    expect(calcularInteres(800_000, 2, 4)).toBe(64_000);
    expect(calcularInteres(800_000, 0, 4)).toBe(0);
  });

  it('el sobrante va a la última cuota, igual que en el servidor', () => {
    const cuotas = repartirCuotas(100_000, 3);
    expect(cuotas).toEqual([33_333, 33_333, 33_334]);
    expect(cuotas.reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  it('las fechas respetan el día del mes', () => {
    const f = fechasMensuales(new Date(Date.UTC(2026, 0, 31)), 3);
    expect(f.map((d) => d.toISOString().slice(0, 10)))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });
});

describe('armarPlan en el navegador', () => {
  it('lee la fecha del formulario sin correrse un día', () => {
    // El input date entrega "2026-10-15". Leerlo como fecha local haría que en
    // Colombia (UTC-5) se guardara el 14.
    const plan = armarPlan(400_000, 2, 0, '2026-10-15');
    expect(plan.cuotas[0].fecha.toISOString().slice(0, 10)).toBe('2026-10-15');
    expect(plan.cuotas[1].fecha.toISOString().slice(0, 10)).toBe('2026-11-15');
  });

  it('acepta montos ajustados a mano', () => {
    const plan = armarPlan(800_000, 4, 2, '2026-10-15', [300_000, 200_000, 200_000, 164_000]);
    expect(plan.cuotas.map((c) => c.monto)).toEqual([300_000, 200_000, 200_000, 164_000]);
    expect(plan.cuotas.reduce((s, c) => s + c.monto, 0)).toBe(plan.total);
  });

  it('sin interés, las cuotas suman el saldo', () => {
    const plan = armarPlan(500_000, 5, 0, '2026-10-01');
    expect(plan.total).toBe(500_000);
    expect(plan.cuotas.reduce((s, c) => s + c.monto, 0)).toBe(500_000);
  });
});
