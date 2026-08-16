import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  calcularDV, calidadBloqueada, estadoManual, diasHastaVencimiento,
  situacionPorFecha, urgenciaVencimiento, formatNit, formatFecha,
  resumenCalidades, OBLIGACION_LABEL, type TaxClient,
} from '../contable';

describe('calcularDV', () => {
  // NITs públicos reales: el DV se puede verificar contra el RUT de cada empresa.
  it.each([
    ['890903938', 8, 'Bancolombia'],
    ['899999068', 1, 'Ecopetrol'],
    ['890900608', 9, 'Grupo Éxito'],
    ['800197268', 4, 'DIAN'],
  ])('%s → DV %i (%s)', (nit, esperado) => {
    expect(calcularDV(nit)).toBe(esperado);
  });

  it('ignora puntos, guiones y espacios de lo que escribe el contador', () => {
    expect(calcularDV('890.903.938')).toBe(8);
    expect(calcularDV('890 903 938')).toBe(8);
    expect(calcularDV('890-903-938')).toBe(8);
  });

  it('devuelve null si no hay dígitos', () => {
    expect(calcularDV('')).toBeNull();
    expect(calcularDV('abc')).toBeNull();
  });

  it('siempre da un dígito entre 0 y 9', () => {
    for (const nit of ['1', '12345', '900123456', '1020304050']) {
      const dv = calcularDV(nit)!;
      expect(dv).toBeGreaterThanOrEqual(0);
      expect(dv).toBeLessThanOrEqual(9);
    }
  });
});

describe('calidadBloqueada — exclusión del Régimen Simple', () => {
  it('bloquea RST si el cliente ya declara renta o es agente retenedor', () => {
    expect(calidadBloqueada('rst', ['declarante_renta'])).toBe(true);
    expect(calidadBloqueada('rst', ['agente_retenedor'])).toBe(true);
  });

  it('bloquea renta y retención si ya está marcado RST', () => {
    expect(calidadBloqueada('declarante_renta', ['rst'])).toBe(true);
    expect(calidadBloqueada('agente_retenedor', ['rst'])).toBe(true);
  });

  it('deja convivir RST con IVA e impoconsumo', () => {
    expect(calidadBloqueada('rst', ['responsable_iva', 'impoconsumo'])).toBe(false);
    expect(calidadBloqueada('responsable_iva', ['rst'])).toBe(false);
    expect(calidadBloqueada('impoconsumo', ['rst'])).toBe(false);
  });

  it('no bloquea nada cuando no hay nada seleccionado', () => {
    expect(calidadBloqueada('rst', [])).toBe(false);
    expect(calidadBloqueada('declarante_renta', [])).toBe(false);
  });
});

describe('estadoManual', () => {
  it('conserva los estados que el contador sí elige', () => {
    expect(estadoManual('presentada')).toBe('presentada');
    expect(estadoManual('pagada')).toBe('pagada');
  });

  it('muestra como "pendiente" los estados heredados que ya no son manuales', () => {
    // "vencida" se calcula de la fecha, no se elige: el selector no debe ofrecerla.
    expect(estadoManual('vencida')).toBe('pendiente');
    expect(estadoManual('en_proceso')).toBe('pendiente');
    expect(estadoManual('pendiente')).toBe('pendiente');
  });
});

describe('diasHastaVencimiento / situacionPorFecha', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // 15 de agosto de 2026, 10:00 en Colombia (15:00 UTC).
    vi.setSystemTime(new Date('2026-08-15T15:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('cuenta los días de calendario contra el día en Colombia', () => {
    expect(diasHastaVencimiento('2026-08-15T00:00:00.000Z')).toBe(0);
    expect(diasHastaVencimiento('2026-08-16T00:00:00.000Z')).toBe(1);
    expect(diasHastaVencimiento('2026-08-25T00:00:00.000Z')).toBe(10);
    expect(diasHastaVencimiento('2026-08-10T00:00:00.000Z')).toBe(-5);
  });

  it('no se corre de día por la hora de Colombia (UTC-5)', () => {
    // A las 22:00 de Colombia ya es el día siguiente en UTC. El vencimiento de
    // hoy debe seguir contando como "hoy", no como "ayer".
    vi.setSystemTime(new Date('2026-08-16T03:00:00.000Z')); // 15/08 10:00 p.m. CO
    expect(diasHastaVencimiento('2026-08-15T00:00:00.000Z')).toBe(0);
  });

  it('devuelve 0 ante una fecha inválida en vez de NaN', () => {
    expect(diasHastaVencimiento('basura')).toBe(0);
  });

  it('describe la situación en palabras', () => {
    expect(situacionPorFecha('2026-08-15T00:00:00.000Z', false)!.label).toBe('Vence hoy');
    expect(situacionPorFecha('2026-08-16T00:00:00.000Z', false)!.label).toBe('Vence mañana');
    expect(situacionPorFecha('2026-08-20T00:00:00.000Z', false)!.label).toBe('Faltan 5 días');
    expect(situacionPorFecha('2026-08-14T00:00:00.000Z', false)!.label).toBe('Vencido hace 1 día');
    expect(situacionPorFecha('2026-08-10T00:00:00.000Z', false)!.label).toBe('Vencido hace 5 días');
  });

  it('marca como vencido lo de hoy y lo de antes, no lo de mañana', () => {
    expect(situacionPorFecha('2026-08-15T00:00:00.000Z', false)!.vencido).toBe(true);
    expect(situacionPorFecha('2026-08-14T00:00:00.000Z', false)!.vencido).toBe(true);
    expect(situacionPorFecha('2026-08-16T00:00:00.000Z', false)!.vencido).toBe(false);
  });

  it('pinta de ámbar la semana siguiente y de gris lo lejano', () => {
    expect(situacionPorFecha('2026-08-22T00:00:00.000Z', false)!.className).toContain('amber');
    expect(situacionPorFecha('2026-08-23T00:00:00.000Z', false)!.className).toContain('slate');
    expect(situacionPorFecha('2026-08-15T00:00:00.000Z', false)!.className).toContain('red');
  });

  it('no muestra situación si la obligación ya se resolvió', () => {
    expect(situacionPorFecha('2026-08-10T00:00:00.000Z', true)).toBeNull();
    expect(urgenciaVencimiento('2026-08-10T00:00:00.000Z', 'presentada')).toBeNull();
    expect(urgenciaVencimiento('2026-08-10T00:00:00.000Z', 'pagada')).toBeNull();
    // Pendiente y vencida sí muestran la alerta.
    expect(urgenciaVencimiento('2026-08-10T00:00:00.000Z', 'pendiente')).not.toBeNull();
    expect(urgenciaVencimiento('2026-08-10T00:00:00.000Z', 'vencida')).not.toBeNull();
  });
});

describe('formatFecha', () => {
  it('muestra el día real del vencimiento, sin correrlo por zona horaria', () => {
    // Las fechas DIAN llegan como medianoche UTC. Formateadas en hora local de
    // Colombia se verían un día antes — inaceptable en un vencimiento.
    expect(formatFecha('2026-09-04T00:00:00.000Z')).toContain('4');
    expect(formatFecha('2026-09-04T00:00:00.000Z')).not.toContain('3/09');
    expect(formatFecha('2026-01-01T00:00:00.000Z')).toContain('2026');
  });

  it('devuelve "-" si no hay fecha', () => {
    expect(formatFecha(null)).toBe('-');
    expect(formatFecha(undefined)).toBe('-');
    expect(formatFecha('fecha rota')).toBe('-');
  });
});

describe('formatNit', () => {
  it('arma identificación-DV', () => {
    expect(formatNit('890903938', 8)).toBe('890903938-8');
  });
});

describe('resumenCalidades', () => {
  const base: TaxClient = {
    id: '1', razonSocial: 'Comercial S.A.S.', nit: '900123456', dv: 8,
    celular: null, direccion: null, tipoPersona: 'juridica',
    responsabilidades: [], ivaPeriodicidad: null, activo: true,
  };

  it('abrevia la periodicidad del IVA', () => {
    expect(resumenCalidades({ ...base, responsabilidades: ['responsable_iva'], ivaPeriodicidad: 'bimestral' }))
      .toBe('IVA (bim.)');
    expect(resumenCalidades({ ...base, responsabilidades: ['responsable_iva'], ivaPeriodicidad: 'cuatrimestral' }))
      .toBe('IVA (cuatr.)');
  });

  it('une varias calidades en el orden del catálogo', () => {
    const c = { ...base, responsabilidades: ['declarante_renta', 'responsable_iva'] as TaxClient['responsabilidades'] };
    expect(resumenCalidades(c)).toBe('IVA · Renta');
  });

  it('avisa cuando el cliente no tiene calidades', () => {
    expect(resumenCalidades(base)).toBe('Sin calidades');
  });
});

describe('OBLIGACION_LABEL', () => {
  it('tiene etiqueta para cada obligación que se genera', () => {
    expect(OBLIGACION_LABEL.pila).toBe('PILA');
    expect(OBLIGACION_LABEL.exogena).toBe('Información exógena');
    expect(OBLIGACION_LABEL.nomina).toBe('Nómina electrónica');
  });
});
