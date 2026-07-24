import { Calidad, Obligacion } from '@prisma/client';

// Reglas de calidades tributarias. Portadas de types.ts de la app de referencia,
// verificadas con un contador. Viven en el backend como fuente de verdad (defensa
// en profundidad): aunque la UI ya bloquee combinaciones imposibles, el guardado
// las normaliza igual.

/** Quien tributa por el Régimen Simple no declara renta por el régimen ordinario
 *  ni actúa como agente retenedor: son calidades excluyentes con RST. Entre sí,
 *  declarante de renta y agente retenedor SÍ se combinan; impoconsumo va con todo. */
export const INCOMPATIBLES_CON_RST: Calidad[] = ['declarante_renta', 'agente_retenedor'];

const CALIDADES_VALIDAS = new Set<string>(Object.values(Calidad));

/** Filtra a valores válidos y quita las combinaciones que la ley no permite. */
export function normalizarResponsabilidades(codigos: unknown): Calidad[] {
  const entrada = Array.isArray(codigos) ? codigos : [];
  const validas = Array.from(new Set(entrada.filter((c): c is Calidad => CALIDADES_VALIDAS.has(c as string))));
  if (!validas.includes('rst')) return validas;
  return validas.filter((c) => !INCOMPATIBLES_CON_RST.includes(c));
}

/** Obligación que sugiere cada calidad (§5.5). ICA, PILA y exógena NO se sugieren:
 *  dependen de municipio, empleados y topes, no de las calidades. */
const OBLIGACION_POR_CALIDAD: Partial<Record<Calidad, Obligacion>> = {
  responsable_iva: 'iva',
  declarante_renta: 'renta',
  agente_retenedor: 'retefuente',
  impoconsumo: 'impoconsumo',
  rst: 'simple',
};

/** Dadas las calidades de un cliente y las obligaciones que ya tiene registradas,
 *  devuelve las que le faltan según sus calidades. */
export function obligacionesSugeridas(
  responsabilidades: Calidad[],
  yaRegistradas: Obligacion[],
): Obligacion[] {
  const existentes = new Set(yaRegistradas);
  const sugeridas = new Set<Obligacion>();
  for (const c of responsabilidades) {
    const obl = OBLIGACION_POR_CALIDAD[c];
    if (obl && !existentes.has(obl)) sugeridas.add(obl);
  }
  return Array.from(sugeridas);
}
