import {
  calcularDV, soloDigitos, separarNitDv, nitConDvPegado, ultimoDigito, dosUltimosDigitos,
} from '../../utils/nit';

// El NIT es la llave del cliente contable y, por su último dígito, define TODO su
// calendario DIAN. Un dígito de más (por ejemplo el DV metido dentro del número)
// le cambia las fechas de vencimiento al cliente, así que estas conversiones son
// críticas.

describe('separarNitDv', () => {
  it.each([
    ['900123456-7', '900123456', 7],
    ['900.123.456-7', '900123456', 7],
    ['900 123 456 - 7', '900123456', 7],
    ['901234567-0', '901234567', 0],
  ])('separa el DV de %s', (entrada, nit, dv) => {
    expect(separarNitDv(entrada)).toEqual({ nit, dvExplicito: dv });
  });

  it.each([
    ['900123456', '900123456'],   // NIT normal, sin DV escrito
    ['900.123.456', '900123456'], // con puntos de miles
    ['1020304050', '1020304050'], // cédula de 10 dígitos: NO es un NIT con DV
  ])('deja %s completo cuando no trae guion', (entrada, esperado) => {
    expect(separarNitDv(entrada)).toEqual({ nit: esperado, dvExplicito: null });
  });

  it.each([
    ['', ''],
    ['   ', ''],
    ['sin numeros', ''],
  ])('devuelve vacío para %s', (entrada) => {
    expect(separarNitDv(entrada).nit).toBe('');
  });

  it('sin dígitos antes del guion no hay DV que separar', () => {
    // "-7" no es "NIT-DV": el 7 es el único número que hay, así que es el NIT.
    expect(separarNitDv('-7')).toEqual({ nit: '7', dvExplicito: null });
  });

  it('no rompe con null o undefined', () => {
    expect(separarNitDv(null as unknown as string).nit).toBe('');
    expect(separarNitDv(undefined as unknown as string).nit).toBe('');
  });

  it('un guion en la mitad (no al final) no se toma como DV', () => {
    expect(separarNitDv('900-123456')).toEqual({ nit: '900123456', dvExplicito: null });
  });
});

describe('calcularDV', () => {
  // NITs públicos reales: el DV se verifica contra el RUT de cada empresa.
  // Los mismos casos que usa el test del frontend (deben dar idéntico).
  it.each([
    ['890903938', 8, 'Bancolombia'],
    ['899999068', 1, 'Ecopetrol'],
    ['890900608', 9, 'Grupo Éxito'],
    ['800197268', 4, 'DIAN'],
  ])('%s → DV %i (%s)', (nit, esperado) => {
    expect(calcularDV(nit)).toBe(esperado);
  });

  it('es estable: el mismo NIT siempre da el mismo DV', () => {
    expect(calcularDV('890903938')).toBe(calcularDV('890.903.938'));
  });

  it('un dígito de más cambia el DV (por eso importa separarlo)', () => {
    expect(calcularDV('8909039388')).not.toBe(calcularDV('890903938'));
  });
});

describe('separarNitDv + calcularDV, juntos', () => {
  it.each([
    ['890903938-8', '890903938', 8],
    ['899.999.068-1', '899999068', 1],
    ['800197268-4', '800197268', 4],
  ])('un NIT del RUT (%s) conserva su DV real', (crudo, nitEsperado, dvEsperado) => {
    const { nit, dvExplicito } = separarNitDv(crudo);
    expect(nit).toBe(nitEsperado);
    expect(dvExplicito).toBe(dvEsperado);
    // Lo escrito en el RUT y lo que calcula la fórmula coinciden.
    expect(calcularDV(nit)).toBe(dvExplicito);
  });

  it('detecta un NIT mal digitado: el DV escrito no cuadra con el calculado', () => {
    const { nit, dvExplicito } = separarNitDv('890903938-3');
    expect(dvExplicito).toBe(3);
    expect(calcularDV(nit)).toBe(8); // el correcto
  });
});

// Este detector decide qué clientes toca el script de reparación
// (scripts/backfillNitDv.ts). Un falso positivo le cambiaría el NIT a un cliente
// que estaba bien, así que ante la duda tiene que devolver null.
describe('nitConDvPegado', () => {
  it.each([
    ['8909039388', '890903938', 'Bancolombia con su DV pegado'],
    ['8999990681', '899999068', 'Ecopetrol con su DV pegado'],
    ['8001972684', '800197268', 'DIAN con su DV pegado'],
  ])('detecta %s → %s (%s)', (guardado, esperado) => {
    expect(nitConDvPegado(guardado)).toBe(esperado);
  });

  it('detecta una cédula de 11 dígitos, largo imposible sin el DV', () => {
    const cedula = '1020304050';
    const conDv = `${cedula}${calcularDV(cedula)}`;
    expect(conDv).toHaveLength(11);
    expect(nitConDvPegado(conDv)).toBe(cedula);
  });

  it.each([
    ['890903938', 'un NIT de empresa correcto, de 9 dígitos'],
    ['1020304050', 'una cédula de 10 dígitos'],
    ['79123456', 'una cédula de 8 dígitos'],
  ])('deja quieto %s (%s)', (nit) => {
    expect(nitConDvPegado(nit)).toBeNull();
  });

  it('no toca una cédula de 10 dígitos aunque el DV cuadre de casualidad', () => {
    // Empieza por 1, así que es un documento de persona: no se puede afirmar que
    // el último dígito sea un DV. Pasa 1 de cada 11 veces por puro azar.
    const cedulas = ['1000000000', '1000000001', '1000000002', '1000000003', '1000000004',
                     '1000000005', '1000000006', '1000000007', '1000000008', '1000000009',
                     '1000000010'];
    const casuales = cedulas.filter((c) => calcularDV(c.slice(0, -1)) === Number(c.slice(-1)));
    expect(casuales.length).toBeGreaterThan(0); // el azar existe
    for (const c of casuales) expect(nitConDvPegado(c)).toBeNull(); // y aun así no se toca
  });

  it.each([
    ['9001234561', 'el DV no corresponde'],
    ['', 'vacío'],
    ['900-123', 'con caracteres raros'],
    ['abc', 'sin dígitos'],
  ])('devuelve null para %s (%s)', (nit) => {
    expect(nitConDvPegado(nit)).toBeNull();
  });

  it('lo que corrige queda idéntico a lo que hoy guardaría separarNitDv', () => {
    // Un cliente reparado tiene que quedar igual que si se hubiera importado
    // después del fix; si no, seguiría habiendo dos formas del mismo NIT.
    for (const nit of ['890903938', '899999068', '800197268']) {
      const guardadoMal = `${nit}${calcularDV(nit)}`;
      expect(nitConDvPegado(guardadoMal)).toBe(separarNitDv(`${nit}-${calcularDV(nit)}`).nit);
    }
  });
});

describe('claves del calendario DIAN', () => {
  it('ultimoDigito toma el último del número limpio', () => {
    expect(ultimoDigito('900123456')).toBe(6);
    expect(ultimoDigito('900.123.456')).toBe(6);
    expect(ultimoDigito('')).toBe(0);
  });

  it('dosUltimosDigitos devuelve 00–99 para renta de persona natural', () => {
    expect(dosUltimosDigitos('1020304050')).toBe(50);
    expect(dosUltimosDigitos('1020304005')).toBe(5);
    expect(dosUltimosDigitos('7')).toBe(7);
    expect(dosUltimosDigitos('')).toBe(0);
  });

  it('soloDigitos quita todo lo que no sea número', () => {
    expect(soloDigitos('900.123.456-7')).toBe('9001234567');
    expect(soloDigitos('N/A')).toBe('');
  });
});
