import { festivosColombia, nthDiaHabil, diaHabilPila, periodosPila } from '../../utils/pila';

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('pila — festivos de Colombia', () => {
  it('incluye el festivo nuevo del 13-jul-2026 (Ley 2578, se corre a lunes) y el 20-jul', () => {
    const f = festivosColombia(2026);
    expect(f.has('2026-07-13')).toBe(true); // 9-jul trasladado a lunes por Emiliani
    expect(f.has('2026-07-20')).toBe(true); // Independencia (fijo)
  });

  it('calcula los festivos clásicos por Ley Emiliani y Semana Santa (2026)', () => {
    const f = festivosColombia(2026);
    expect(f.has('2026-01-01')).toBe(true); // Año Nuevo
    expect(f.has('2026-01-12')).toBe(true); // Reyes (6-ene → lunes)
    expect(f.has('2026-04-02')).toBe(true); // Jueves Santo
    expect(f.has('2026-04-03')).toBe(true); // Viernes Santo
    expect(f.has('2026-12-25')).toBe(true); // Navidad
  });
});

describe('pila — día hábil según dos últimos dígitos (Decreto 1990/2016)', () => {
  const casos: [number, number][] = [
    [0, 2], [7, 2], [8, 3], [14, 3], [15, 4], [21, 4], [28, 5], [35, 6],
    [42, 7], [49, 8], [56, 9], [63, 10], [64, 11], [69, 11], [75, 12],
    [81, 13], [87, 14], [93, 15], [94, 16], [99, 16],
  ];
  it.each(casos)('dígitos %i → %i° día hábil', (dig, dh) => {
    expect(diaHabilPila(dig)).toBe(dh);
  });
});

describe('pila — N-ésimo día hábil de julio 2026 (validado vs. miplanilla.com)', () => {
  // Tabla oficial completa de empresas.miplanilla.com para julio 2026.
  const oficial: [number, string][] = [
    [2, '2026-07-02'], [3, '2026-07-03'], [4, '2026-07-06'], [5, '2026-07-07'],
    [6, '2026-07-08'], [7, '2026-07-09'], [8, '2026-07-10'], [9, '2026-07-14'],
    [10, '2026-07-15'], [11, '2026-07-16'], [12, '2026-07-17'], [13, '2026-07-21'],
    [14, '2026-07-22'], [15, '2026-07-23'], [16, '2026-07-24'],
  ];
  it.each(oficial)('%i° día hábil de julio 2026 = %s', (n, fecha) => {
    expect(iso(nthDiaHabil(2026, 7, n))).toBe(fecha);
  });
});

describe('pila — periodosPila', () => {
  it('rotula el período por el mes de cotización y vence el mes SIGUIENTE', () => {
    // NIT terminado en 00 → 2° día hábil del MES SIGUIENTE.
    const p = periodosPila('900123400', 2026);
    expect(p).toHaveLength(12);
    // Los aportes de julio vencen en agosto (2° día hábil de agosto para este NIT).
    expect(p[6].periodo).toBe('Julio 2026');
    expect(iso(p[6].fecha)).toBe(iso(nthDiaHabil(2026, 8, 2)));
    // Los aportes de agosto vencen en septiembre.
    expect(p[7].periodo).toBe('Agosto 2026');
    expect(iso(p[7].fecha)).toBe(iso(nthDiaHabil(2026, 9, 2)));
    // Diciembre vence en enero del AÑO SIGUIENTE.
    expect(p[11].periodo).toBe('Diciembre 2026');
    expect(iso(p[11].fecha)).toBe(iso(nthDiaHabil(2027, 1, 2)));
  });
});
