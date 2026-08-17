import { describe, it, expect } from 'vitest';
import { PLANS, SELLERS, DEFAULT_SELLER, resolveSeller } from '../planesData';

// Esta es la página pública de precios: un error aquí se le cobra mal a un
// cliente o le manda el WhatsApp a la vendedora equivocada.

describe('resolveSeller', () => {
  it('encuentra a la vendedora del enlace /planes?v=<slug>', () => {
    expect(resolveSeller('franklin').name).toBe('Franklin Vargas');
    expect(resolveSeller('lina').phone).toBe(SELLERS.lina.phone);
  });

  it('no distingue mayúsculas ni espacios sobrantes', () => {
    expect(resolveSeller('  FRANKLIN  ').name).toBe('Franklin Vargas');
  });

  it('cae en el número general si el enlace viene sin slug o con uno inventado', () => {
    expect(resolveSeller(undefined)).toBe(DEFAULT_SELLER);
    expect(resolveSeller('')).toBe(DEFAULT_SELLER);
    expect(resolveSeller('no-existe')).toBe(DEFAULT_SELLER);
  });

  it('todos los teléfonos son celulares colombianos (57 + 3xx)', () => {
    for (const v of [...Object.values(SELLERS), DEFAULT_SELLER]) {
      expect(v.phone).toMatch(/^573\d{9}$/);
    }
  });
});

describe('PLANS', () => {
  const pos = PLANS.find((p) => p.key === 'pos')!;
  const contable = PLANS.find((p) => p.key === 'contable')!;

  it('publica los dos productos', () => {
    expect(PLANS.map((p) => p.key)).toEqual(['pos', 'contable']);
  });

  it('cada producto tiene un plan gratis y uno de pago destacado', () => {
    for (const producto of PLANS) {
      expect(producto.tiers.some((t) => t.price === 0)).toBe(true);
      const pago = producto.tiers.filter((t) => t.price > 0);
      expect(pago.length).toBeGreaterThan(0);
      expect(producto.tiers.filter((t) => t.featured)).toHaveLength(1);
    }
  });

  it('el plan gratis se registra y el de pago se compra', () => {
    for (const t of PLANS.flatMap((p) => p.tiers)) {
      expect(t.cta).toBe(t.price === 0 ? 'register' : 'buy');
    }
  });

  it('los precios están en pesos enteros, sin centavos', () => {
    for (const t of PLANS.flatMap((p) => p.tiers)) {
      expect(Number.isInteger(t.price)).toBe(true);
      expect(t.price).toBeGreaterThanOrEqual(0);
    }
  });

  it('POS Pro cuesta $29.900 al mes y Contable $120.000 al año', () => {
    expect(pos.tiers.find((t) => t.name === 'Pro')?.price).toBe(29900);
    expect(contable.tiers.find((t) => t.name === 'Anual')?.price).toBe(120000);
  });

  it('pagar por trimestre o por año sale MÁS BARATO por mes que el mensual', () => {
    // Si un periodo largo saliera más caro, el selector estaría vendiendo al revés.
    const meses = { monthly: 1, quarterly: 3, annual: 12 };
    for (const tier of PLANS.flatMap((p) => p.tiers)) {
      if (!tier.periods) continue;
      const mensual = tier.periods.find((p) => p.key === 'monthly')!;
      for (const periodo of tier.periods) {
        const porMes = periodo.total / meses[periodo.key];
        expect(porMes).toBeLessThanOrEqual(mensual.total);
      }
    }
  });

  it('el ahorro anunciado coincide con el descuento real', () => {
    const meses = { monthly: 1, quarterly: 3, annual: 12 };
    const pro = pos.tiers.find((t) => t.name === 'Pro')!;
    for (const periodo of pro.periods!) {
      if (!periodo.save) continue;
      const mensual = pro.periods!.find((p) => p.key === 'monthly')!.total;
      const ahorroReal = 100 - (periodo.total / meses[periodo.key] / mensual) * 100;
      // Tolerancia de 1 punto por el redondeo del precio a pesos.
      expect(Math.abs(ahorroReal - periodo.save)).toBeLessThan(1);
    }
  });

  it('el precio de la tarjeta es el del periodo mensual', () => {
    for (const tier of PLANS.flatMap((p) => p.tiers)) {
      if (!tier.periods) continue;
      expect(tier.price).toBe(tier.periods.find((p) => p.key === 'monthly')!.total);
    }
  });

  it('ningún plan se publica sin beneficios listados', () => {
    for (const t of PLANS.flatMap((p) => p.tiers)) {
      expect(t.features.length).toBeGreaterThan(0);
      expect(t.features.every((f) => f.trim().length > 0)).toBe(true);
    }
  });
});
