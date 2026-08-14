// Cálculo automático de las fechas de vencimiento de PILA (aportes a seguridad
// social: salud, pensión, riesgos, parafiscales).
//
// A diferencia del calendario DIAN — que se SIEMBRA en tabla año por año — PILA
// sigue una REGLA fija (Decreto 1990 de 2016): el aporte vence el N-ésimo día
// hábil del mes, donde N depende de los DOS ÚLTIMOS dígitos del NIT/documento.
// Por eso se calcula en vivo para cualquier mes y año, sin sembrar nada.
//
// "Día hábil" = lun-vie que no sea festivo nacional. Los festivos se calculan
// (Ley Emiliani + Semana Santa) e INCLUYEN los agregados por ley — p. ej. el 9
// de julio (Ley 2578 de 2026, se traslada al lunes por Emiliani). Validado
// contra empresas.miplanilla.com para julio 2026: las 15 franjas coinciden.
//
// Nota importante: como el Congreso puede crear festivos NUEVOS que no siguen
// ninguna regla (como pasó con el 9 de julio), la fecha auto-calculada siempre
// queda EDITABLE en el formulario. Si algún año aparece un festivo no
// contemplado aquí, el contador corrige la fecha a mano y se agrega a la lista.

import { dosUltimosDigitos } from './nit';

function easterSunday(year: number): Date {
  // Algoritmo de Meeus/Jones/Butcher (domingo de Pascua, calendario gregoriano).
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function nextMonday(date: Date): Date {
  const d = new Date(date);
  const dow = d.getUTCDay(); // 0 = dom ... 6 = sáb
  d.setUTCDate(d.getUTCDate() + (dow === 1 ? 0 : (8 - dow) % 7));
  return d;
}

function addDays(base: Date, n: number): Date {
  const x = new Date(base);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

/** Festivos nacionales de Colombia de un año, como set de 'YYYY-MM-DD' (UTC). */
export function festivosColombia(year: number): Set<string> {
  const H: Date[] = [];
  // Fijos (no se trasladan): Año Nuevo, Trabajo, Independencia, Boyacá,
  // Inmaculada, Navidad.
  ([[1, 1], [5, 1], [7, 20], [8, 7], [12, 8], [12, 25]] as const)
    .forEach(([m, d]) => H.push(new Date(Date.UTC(year, m - 1, d))));
  // Ley Emiliani: se trasladan al lunes siguiente. Incluye el 9 de julio
  // (Ley 2578 de 2026: Ntra. Sra. del Rosario de Chiquinquirá).
  ([[1, 6], [3, 19], [6, 29], [7, 9], [8, 15], [10, 12], [11, 1], [11, 11]] as const)
    .forEach(([m, d]) => H.push(nextMonday(new Date(Date.UTC(year, m - 1, d)))));
  // Basados en Semana Santa.
  const e = easterSunday(year);
  H.push(addDays(e, -3)); // Jueves Santo
  H.push(addDays(e, -2)); // Viernes Santo
  H.push(nextMonday(addDays(e, 43))); // Ascensión del Señor
  H.push(nextMonday(addDays(e, 64))); // Corpus Christi
  H.push(nextMonday(addDays(e, 71))); // Sagrado Corazón
  return new Set(H.map(iso));
}

function esDiaHabil(d: Date, festivos: Set<string>): boolean {
  const dow = d.getUTCDay();
  return dow !== 0 && dow !== 6 && !festivos.has(iso(d));
}

/** N-ésimo día hábil de un mes (1-based). `month` va de 1 a 12. */
export function nthDiaHabil(year: number, month: number, n: number): Date {
  const festivos = festivosColombia(year);
  let count = 0;
  const d = new Date(Date.UTC(year, month - 1, 1));
  while (d.getUTCMonth() === month - 1) {
    if (esDiaHabil(d, festivos)) {
      count++;
      if (count === n) return new Date(d);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  // Salvaguarda: nunca debería alcanzarse (todo mes tiene ≥ 16 días hábiles).
  return new Date(Date.UTC(year, month, 0));
}

/** Día hábil de vencimiento según los dos últimos dígitos del documento
 *  (Decreto 1990 de 2016): 00-07 → 2°, luego grupos de 7 hasta 57-63 → 10°,
 *  luego grupos de 6 hasta 94-99 → 16°. */
export function diaHabilPila(dosDigitos: number): number {
  if (dosDigitos <= 7) return 2;
  if (dosDigitos <= 63) return 3 + Math.floor((dosDigitos - 8) / 7);
  return 11 + Math.floor((dosDigitos - 64) / 6);
}

export interface PeriodoPila {
  periodo: string;
  fecha: Date;
}

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Los 12 vencimientos mensuales de PILA de un año para un NIT. El período se
 *  rotula por el mes de COTIZACIÓN (los aportes de ese mes) y vence en el mes
 *  SIGUIENTE, en el día hábil que le corresponde al documento (Decreto 1990 de
 *  2016). Ej.: los aportes de AGOSTO vencen en SEPTIEMBRE. Para diciembre, el
 *  vencimiento cae en enero del año siguiente. */
export function periodosPila(nit: string, year: number): PeriodoPila[] {
  const diaHabil = diaHabilPila(dosUltimosDigitos(nit));
  const periodos: PeriodoPila[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const mesSiguiente = mes === 12 ? 1 : mes + 1;
    const anioVenc = mes === 12 ? year + 1 : year;
    periodos.push({ periodo: `${MESES[mes - 1]} ${year}`, fecha: nthDiaHabil(anioVenc, mesSiguiente, diaHabil) });
  }
  return periodos;
}

/** Cálculo ANTERIOR de PILA, cuando el vencimiento se ponía en el MISMO mes del
 *  período. Ya no se usa para generar: se conserva para RECONOCER las fechas que
 *  quedaron guardadas con la regla vieja y corregirlas sin pisar las que el
 *  contador editó a mano. Ver config/fixPilaDates.ts. */
export function periodosPilaLegacy(nit: string, year: number): PeriodoPila[] {
  const diaHabil = diaHabilPila(dosUltimosDigitos(nit));
  return MESES.map((mes, i) => ({
    periodo: `${mes} ${year}`,
    fecha: nthDiaHabil(year, i + 1, diaHabil),
  }));
}

/** Los 12 vencimientos mensuales de la NÓMINA ELECTRÓNICA de un año: cada mes se
 *  reporta dentro de los primeros 10 días HÁBILES del mes SIGUIENTE. El período
 *  se rotula por el mes reportado; la fecha es el 10° día hábil del mes siguiente
 *  (para diciembre cae en enero del año siguiente). Igual para todos los NIT: no
 *  hay escalonamiento por dígito (a diferencia de PILA). */
export function periodosNomina(year: number): PeriodoPila[] {
  const periodos: PeriodoPila[] = [];
  for (let mes = 1; mes <= 12; mes++) {
    const mesSiguiente = mes === 12 ? 1 : mes + 1;
    const anioVenc = mes === 12 ? year + 1 : year;
    periodos.push({ periodo: `${MESES[mes - 1]} ${year}`, fecha: nthDiaHabil(anioVenc, mesSiguiente, 10) });
  }
  return periodos;
}
