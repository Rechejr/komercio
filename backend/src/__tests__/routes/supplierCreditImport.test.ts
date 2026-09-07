import { normalizarIdentificacion as normalizarId } from '../../utils/nit';

// El NIT es lo que decide si dos filas del Excel son el MISMO proveedor. Cada
// negocio lo escribe distinto (con puntos, con guion, con el dígito de
// verificación o sin él), así que la comparación tiene que aguantar todo eso.
describe('identificación del proveedor al importar cuentas por pagar', () => {
  it('ignora puntos, guiones y espacios', () => {
    expect(normalizarId('900.123.456')).toBe('900123456');
    expect(normalizarId('900 123 456')).toBe('900123456');
    expect(normalizarId('900-123-456')).toBe('900123456');
  });

  it('descarta el dígito de verificación, que unos escriben y otros no', () => {
    // Un NIT de 9 dígitos con DV pegado son 10: se compara contra los 9 reales.
    expect(normalizarId('900123456-7')).toBe('900123456');
    expect(normalizarId('9001234567')).toBe('900123456');
    expect(normalizarId('900123456')).toBe('900123456');
  });

  it('dos formas de escribir el mismo NIT emparejan entre sí', () => {
    const formas = ['900.123.456-7', '900123456', '900 123 456 - 7', '9001234567'];
    const iguales = new Set(formas.map(normalizarId));
    expect(iguales.size).toBe(1);
  });

  it('NIT distintos NO se confunden', () => {
    expect(normalizarId('900123456-7')).not.toBe(normalizarId('900123457-9'));
  });

  it('una cédula de 10 dígitos se respeta COMPLETA', () => {
    // Lo contrario fundiría dos cédulas que solo cambian en el último dígito,
    // que es justo el error que esta columna viene a evitar.
    expect(normalizarId('1085248963')).toBe('1085248963');
    expect(normalizarId('1085248964')).toBe('1085248964');
    expect(normalizarId('1085248963')).not.toBe(normalizarId('1085248964'));
    expect(normalizarId('12345678')).toBe('12345678');
  });

  it('un NIT de empresa con el DV pegado sí se reconoce (9 dígitos + DV)', () => {
    // Los NIT de empresa empiezan por 8 o 9 y tienen 9 dígitos: con el DV, 10.
    expect(normalizarId('9001234567')).toBe('900123456');
    expect(normalizarId('8001234565')).toBe('800123456');
  });

  it('acepta identificaciones con letras (pasaporte, RUT extranjero)', () => {
    expect(normalizarId('AB-1234-C')).toBe('AB1234C');
  });

  it('vacío o basura devuelve cadena vacía, para caer al nombre', () => {
    expect(normalizarId('')).toBe('');
    expect(normalizarId('---')).toBe('');
    expect(normalizarId(null as unknown as string)).toBe('');
  });
});
