// Algoritmo oficial (DIAN) para el dígito de verificación de un NIT colombiano:
// cada dígito (de derecha a izquierda) se multiplica por un peso fijo, se suma,
// y el resto de dividir entre 11 determina el DV. Portado tal cual de la app de
// escritorio de referencia (src/lib/nit.ts) — no re-derivar.
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function calcularDV(nitCrudo: string): number {
  const digitos = nitCrudo
    .replace(/\D/g, '')
    .split('')
    .reverse()
    .map(Number);

  const suma = digitos.reduce((acc, d, i) => acc + d * (PESOS[i] ?? 0), 0);
  const resto = suma % 11;
  return resto < 2 ? resto : 11 - resto;
}

/** Solo los dígitos del NIT (quita puntos, guiones y el DV si viene pegado no:
 *  el DV se pasa aparte). */
export function soloDigitos(nit: string): string {
  return nit.replace(/\D/g, '');
}

/** Separa el NIT del dígito de verificación cuando viene escrito con guion
 *  ("900.123.456-7" → nit 900123456, dv 7), que es como lo trae el RUT y casi
 *  todo Excel de contador. Sin esta separación el DV entraría como parte del
 *  número: el NIT quedaría con un dígito de más y —peor— el último dígito, que
 *  es la clave del calendario DIAN, sería el equivocado.
 *
 *  Solo separa si hay guion seguido de UN dígito al final. Sin guion no se puede
 *  adivinar: una cédula de 10 dígitos es un número legítimo, no un NIT con DV. */
export function separarNitDv(raw: string): { nit: string; dvExplicito: number | null } {
  const texto = String(raw ?? '').trim();
  const conGuion = /^(.*\d)\s*-\s*(\d)$/.exec(texto);
  if (conGuion) {
    const nit = soloDigitos(conGuion[1]);
    if (nit) return { nit, dvExplicito: Number(conGuion[2]) };
  }
  return { nit: soloDigitos(texto), dvExplicito: null };
}

/** Último dígito del NIT — clave general del calendario DIAN. */
export function ultimoDigito(nit: string): number {
  return Number(soloDigitos(nit).slice(-1) || '0');
}

/** Dos últimos dígitos (00–99) — clave de renta de personas naturales. */
export function dosUltimosDigitos(nit: string): number {
  const limpio = soloDigitos(nit);
  return Number(limpio.slice(-2).padStart(2, '0') || '0');
}
