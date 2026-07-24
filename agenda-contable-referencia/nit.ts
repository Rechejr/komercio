// Algoritmo oficial (DIAN / Superintendencia) para calcular el dígito de
// verificación de un NIT colombiano: cada dígito (de derecha a izquierda)
// se multiplica por un peso fijo, se suma, y el resto de dividir entre 11
// determina el DV.
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

export function calcularDV(nitCrudo: string): number {
  const digitos = nitCrudo
    .replace(/\D/g, "")
    .split("")
    .reverse()
    .map(Number);

  const suma = digitos.reduce((acc, d, i) => acc + d * (PESOS[i] ?? 0), 0);
  const resto = suma % 11;
  return resto < 2 ? resto : 11 - resto;
}
