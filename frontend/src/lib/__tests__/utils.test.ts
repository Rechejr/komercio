import { describe, it, expect } from 'vitest';
import {
  cn, formatCurrency, formatDate, formatDateTime, formatNumber,
  formatChartDate, truncate, getInitials, statusColor, statusLabel,
  paymentMethodLabel,
} from '../utils';

// Las salidas de Intl cambian de forma entre versiones de Node/ICU (el espacio
// tras el "$" es NBSP, y "medium" puede ser "15/08/2026" o "15 ago 2026"). Se
// afirma sobre lo que el negocio necesita — separador de miles, sin centavos, el
// día correcto — y no sobre el formato exacto, para que el CI no se vuelva
// frágil al subir de versión de Node.
const soloNumero = (s: string) => s.replace(/[^\d.,]/g, '');

describe('cn', () => {
  it('resuelve clases de Tailwind en conflicto quedándose con la última', () => {
    expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
  });

  it('ignora los valores falsos de las clases condicionales', () => {
    expect(cn('base', false && 'oculta', undefined, 'activa')).toBe('base activa');
  });
});

describe('formatCurrency', () => {
  it('usa el punto como separador de miles y no muestra centavos', () => {
    expect(soloNumero(formatCurrency(1234))).toBe('1.234');
    expect(soloNumero(formatCurrency(1234567))).toBe('1.234.567');
    expect(formatCurrency(1234)).toContain('$');
  });

  it('redondea los decimales en vez de arrastrarlos', () => {
    // En el POS los totales se muestran sin centavos: 19.900,6 debe verse 19.901.
    expect(soloNumero(formatCurrency(19900.6))).toBe('19.901');
  });

  it('maneja el cero y los negativos (devoluciones)', () => {
    expect(soloNumero(formatCurrency(0))).toBe('0');
    expect(formatCurrency(-500)).toContain('-');
  });
});

describe('formatDate / formatDateTime', () => {
  it('devuelve "-" cuando no hay fecha o la fecha es inválida', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
    expect(formatDate('')).toBe('-');
    expect(formatDate('no-es-una-fecha')).toBe('-');
    expect(formatDateTime(null)).toBe('-');
    expect(formatDateTime('cualquier cosa')).toBe('-');
  });

  it('muestra el día correcto', () => {
    // Mediodía UTC: cae el mismo día de calendario en cualquier zona horaria.
    const salida = formatDate('2026-08-15T12:00:00.000Z');
    expect(salida).toContain('15');
    expect(salida).toContain('2026');
  });

  it('formatDateTime agrega la hora', () => {
    const salida = formatDateTime('2026-08-15T17:30:00.000Z'); // 12:30 en Colombia
    expect(salida).toContain('12:30');
  });
});

describe('formatNumber', () => {
  it('separa los miles con punto (formato colombiano)', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(0)).toBe('0');
  });
});

describe('formatChartDate', () => {
  it('convierte YYYY-MM-DD al día y mes corto del eje', () => {
    expect(formatChartDate('2026-06-25')).toBe('25 jun');
    expect(formatChartDate('2026-01-01')).toBe('1 ene');
    expect(formatChartDate('2026-12-31')).toBe('31 dic');
  });

  it('NO corre el día por zona horaria', () => {
    // El bug clásico: new Date('2026-01-01') es medianoche UTC y en Colombia
    // (UTC-5) se vería como 31 dic. Por eso la función parte el string a mano.
    expect(formatChartDate('2026-01-01')).toBe('1 ene');
  });

  it('devuelve el string original si no tiene el formato esperado', () => {
    expect(formatChartDate('sin-formato')).toBe('sin-formato');
  });
});

describe('truncate', () => {
  it('corta y agrega puntos suspensivos solo si se pasa del largo', () => {
    expect(truncate('corto')).toBe('corto');
    expect(truncate('a'.repeat(31))).toBe(`${'a'.repeat(30)}...`);
    expect(truncate('abcdef', 3)).toBe('abc...');
  });

  it('no toca el texto que mide exactamente el máximo', () => {
    expect(truncate('abc', 3)).toBe('abc');
  });
});

describe('getInitials', () => {
  it('toma la inicial de los dos primeros nombres, en mayúscula', () => {
    expect(getInitials('cristian camilo rojas')).toBe('CC');
    expect(getInitials('Ventrix')).toBe('V');
  });
});

describe('statusColor / statusLabel', () => {
  it('traduce los estados de venta al español', () => {
    expect(statusLabel('COMPLETED')).toBe('Completado');
    expect(statusLabel('REFUNDED')).toBe('Devuelto');
    expect(statusLabel('PARTIAL')).toBe('Abonado');
  });

  it('deja pasar tal cual un estado desconocido en vez de romper la tabla', () => {
    expect(statusLabel('LO_QUE_SEA')).toBe('LO_QUE_SEA');
    expect(statusColor('LO_QUE_SEA')).toBe('badge-slate');
  });

  it('pinta de rojo lo anulado y lo vencido', () => {
    expect(statusColor('CANCELLED')).toBe('badge-red');
    expect(statusColor('OVERDUE')).toBe('badge-red');
  });
});

describe('paymentMethodLabel', () => {
  it('cubre los medios de pago que muestra el POS', () => {
    expect(paymentMethodLabel.CASH).toBe('Efectivo');
    expect(paymentMethodLabel.NEQUI).toBe('Nequi');
    expect(paymentMethodLabel.MIXED).toBe('Mixto');
  });
});
