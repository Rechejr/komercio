import { comisionDe, planDesdeMonto, planDesdeDuracion, COMMISSION_RATE, ANNUAL_CAP } from '../../utils/comision';

// La comisión es plata que se le paga a una persona: la fórmula vive ahora en el
// servidor (antes solo en el navegador del portal) y esta es su red de seguridad.
// Reglas: 30% del primer pago, con tope de $40.000 en planes anuales.

describe('comisionDe', () => {
  it('cobra el 30% en los planes no anuales', () => {
    expect(comisionDe(29900, false)).toBe(8970);   // POS mensual
    expect(comisionDe(80700, false)).toBe(24210);  // POS trimestral
  });

  it('topa en $40.000 los planes anuales', () => {
    // Sin tope, un POS anual pagaría $86.100 de comisión.
    expect(comisionDe(287000, true)).toBe(ANNUAL_CAP);
  });

  it('el tope no infla las comisiones que quedan por debajo', () => {
    // Contable anual: 30% de 120.000 = 36.000, y eso es menos que el tope.
    expect(comisionDe(120000, true)).toBe(36000);
  });

  it('redondea a pesos, sin centavos', () => {
    expect(Number.isInteger(comisionDe(29900, false))).toBe(true);
    expect(comisionDe(0, false)).toBe(0);
  });

  it('el porcentaje publicado es el que se aplica', () => {
    expect(COMMISSION_RATE).toBe(0.3);
  });
});

describe('planDesdeMonto — venta por el link (se conoce lo que pagó)', () => {
  it('reconoce el periodo por el monto', () => {
    expect(planDesdeMonto(29900, 'pos').periodo).toBe('Mensual');
    expect(planDesdeMonto(80700, 'pos').periodo).toBe('Trimestral');
    expect(planDesdeMonto(287000, 'pos').periodo).toBe('Anual');
  });

  it('Contable siempre es anual', () => {
    expect(planDesdeMonto(120000, 'contable')).toEqual({ periodo: 'Anual', precio: 120000, comision: 36000 });
  });

  it('usa el monto REAL pagado como precio, no un precio de lista', () => {
    // Si algún día se hace una promoción, la comisión sale de lo que entró.
    const plan = planDesdeMonto(19900, 'pos');
    expect(plan.precio).toBe(19900);
    expect(plan.comision).toBe(5970);
  });

  it('aplica el tope anual también aquí', () => {
    expect(planDesdeMonto(287000, 'pos').comision).toBe(ANNUAL_CAP);
  });
});

describe('planDesdeDuracion — cuenta creada a mano (no se guardó el monto)', () => {
  const conMeses = (meses: number, type = 'pos') => {
    const createdAt = new Date('2026-01-15T00:00:00Z');
    const planExpiresAt = new Date(createdAt.getTime() + meses * 30 * 24 * 60 * 60 * 1000);
    return planDesdeDuracion({ type, createdAt, planExpiresAt });
  };

  it('deduce el plan por cuánto dura', () => {
    expect(conMeses(1).periodo).toBe('Mensual');
    expect(conMeses(3).periodo).toBe('Trimestral');
    expect(conMeses(12).periodo).toBe('Anual');
  });

  it('Contable es anual sin importar la duración registrada', () => {
    expect(conMeses(1, 'contable')).toEqual({ periodo: 'Anual', precio: 120000, comision: 36000 });
  });

  it('sin fecha de vencimiento cae en el plan más pequeño, no en el más caro', () => {
    // Al no saber, se paga de menos y se corrige a mano: nunca al revés.
    const plan = planDesdeDuracion({ type: 'pos', createdAt: new Date(), planExpiresAt: null });
    expect(plan.periodo).toBe('Mensual');
    expect(plan.comision).toBe(8970);
  });

  it('coincide con el cálculo por monto cuando ambos aplican', () => {
    // Las dos vías tienen que dar lo mismo para el mismo plan; si no, el dueño y
    // la vendedora verían cifras distintas según cómo entró la venta.
    expect(conMeses(3).comision).toBe(planDesdeMonto(80700, 'pos').comision);
    expect(conMeses(12).comision).toBe(planDesdeMonto(287000, 'pos').comision);
    expect(conMeses(1).comision).toBe(planDesdeMonto(29900, 'pos').comision);
  });
});
