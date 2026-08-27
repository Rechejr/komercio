// Tipos, etiquetas y reglas del dominio contable para el frontend. La lógica
// (DV, exclusión RST) es la MISMA del backend — se duplica aquí solo para dar
// respuesta inmediata en la UI; el backend siempre valida de nuevo.

export type Calidad =
  | 'responsable_iva'
  | 'declarante_renta'
  | 'agente_retenedor'
  | 'impoconsumo'
  | 'rst';

export type Obligacion =
  | 'renta' | 'iva' | 'retefuente' | 'ica' | 'exogena' | 'pila' | 'impoconsumo' | 'simple' | 'nomina';

export type EstadoVencimiento =
  | 'pendiente' | 'en_proceso' | 'presentada' | 'pagada' | 'vencida' | 'no_aplica';

export interface TaxClient {
  id: string;
  razonSocial: string;
  nit: string;
  dv: number;
  celular: string | null;
  direccion: string | null;
  tipoPersona: 'natural' | 'juridica';
  responsabilidades: Calidad[];
  ivaPeriodicidad: 'bimestral' | 'cuatrimestral' | null;
  activo: boolean;
}

export const CALIDADES: { codigo: Calidad; label: string; corto: string }[] = [
  { codigo: 'responsable_iva',  label: 'Responsable de IVA',   corto: 'IVA' },
  { codigo: 'declarante_renta', label: 'Declarante de renta',  corto: 'Renta' },
  { codigo: 'agente_retenedor', label: 'Agente retenedor',     corto: 'Retención' },
  { codigo: 'impoconsumo',      label: 'Impoconsumo',          corto: 'Impoconsumo' },
  { codigo: 'rst',              label: 'Régimen Simple (RST)', corto: 'RST' },
];

export const OBLIGACIONES: { codigo: Obligacion; label: string }[] = [
  { codigo: 'renta',       label: 'Renta' },
  { codigo: 'iva',         label: 'IVA' },
  { codigo: 'retefuente',  label: 'Retención en la fuente' },
  { codigo: 'ica',         label: 'ICA' },
  { codigo: 'exogena',     label: 'Información exógena' },
  { codigo: 'pila',        label: 'PILA' },
  { codigo: 'impoconsumo', label: 'Impoconsumo' },
  { codigo: 'simple',      label: 'Régimen Simple' },
  { codigo: 'nomina',      label: 'Nómina electrónica' },
];

export const OBLIGACION_LABEL: Record<Obligacion, string> = Object.fromEntries(
  OBLIGACIONES.map((o) => [o.codigo, o.label]),
) as Record<Obligacion, string>;

export const ESTADOS: { codigo: EstadoVencimiento; label: string }[] = [
  { codigo: 'pendiente',  label: 'Pendiente' },
  { codigo: 'en_proceso', label: 'En proceso' },
  { codigo: 'presentada', label: 'Presentada' },
  { codigo: 'pagada',     label: 'Pagada' },
  { codigo: 'vencida',    label: 'Vencida' },
  { codigo: 'no_aplica',  label: 'No aplica' },
];

export const ESTADO_COLOR: Record<EstadoVencimiento, string> = {
  pendiente:  'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
  en_proceso: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  presentada: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  pagada:     'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  vencida:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  // Apagado a propósito: no es un logro como "presentada", es algo que se
  // descartó. Debe leerse como "aquí no hay nada que hacer".
  no_aplica:  'bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500',
};

// ─── Estado manual vs. situación automática ─────────────────────────────────────
// El contador SOLO elige a mano: Pendiente / Presentada / Pagada / No aplica.
// Que esté "vencida" NO se elige — se calcula de la fecha (un estado que depende
// del tiempo cambia solo, no debe quedar quemado en la base).
export const ESTADOS_MANUALES: { codigo: EstadoVencimiento; label: string }[] = [
  { codigo: 'pendiente',  label: 'Pendiente' },
  { codigo: 'presentada', label: 'Presentada' },
  { codigo: 'pagada',     label: 'Pagada' },
  // Ese periodo no había nada que declarar (p. ej. retefuente en un mes sin
  // retenciones). Se elige periodo por periodo: marcar enero no toca febrero.
  { codigo: 'no_aplica',  label: 'No aplica' },
];

/** Devuelve el estado manual con el que se debe mostrar el selector. Los estados
 *  heredados que ya no son manuales (en_proceso, vencida) se muestran como
 *  "pendiente" — la situación real de vencido la pinta la columna automática. */
export function estadoManual(estado: EstadoVencimiento): EstadoVencimiento {
  return estado === 'presentada' || estado === 'pagada' || estado === 'no_aplica'
    ? estado
    : 'pendiente';
}

/** ¿Este vencimiento ya no requiere ninguna acción? Presentada y pagada son las
 *  cumplidas; "no aplica" no se cumplió, pero tampoco hay nada que hacer. Los
 *  tres se sacan de los avisos, de la cuenta regresiva y del tope de la lista. */
export function vencimientoResuelto(estado: EstadoVencimiento): boolean {
  const e = estadoManual(estado);
  return e === 'presentada' || e === 'pagada' || e === 'no_aplica';
}

/** Periodos únicos de una lista, en orden CRONOLÓGICO — por la fecha más
 *  temprana de cada uno, no por su nombre. Ordenar por texto pondría "Abril,
 *  Agosto, Diciembre…", que para un contador no significa nada. Al mirar la
 *  fecha funciona igual con meses, bimestres, cuatrimestres o un año entero,
 *  sin tener que conocer cómo se llama cada periodo. */
export function periodosOrdenados(items: { periodo: string; fecha: string }[]): string[] {
  const primeraFecha = new Map<string, string>();
  for (const it of items) {
    const actual = primeraFecha.get(it.periodo);
    if (!actual || it.fecha < actual) primeraFecha.set(it.periodo, it.fecha);
  }
  return Array.from(primeraFecha.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([periodo]) => periodo);
}

/** Días de calendario (hora de Colombia) entre hoy y una fecha DIAN (columna
 *  @db.Date, serializada como medianoche UTC). Negativo = ya pasó. Compara el
 *  día de calendario, no las horas, para no correrse por zona horaria. */
export function diasHastaVencimiento(iso: string): number {
  const f = new Date(iso);
  if (isNaN(f.getTime())) return 0;
  const objetivo = Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
  const hoyCO = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = hoyCO.split('-').map(Number);
  const hoy = Date.UTC(y, m - 1, d);
  return Math.round((objetivo - hoy) / 86400000);
}

export interface Urgencia { label: string; className: string; vencido: boolean; }

/** Situación automática por fecha: "Vencido hace N días" / "Vence hoy/mañana" /
 *  "Faltan N días". Si `resuelto` es true (ya cumplido) devuelve null (—). Base
 *  compartida por vencimientos, exógena/otras y resoluciones. */
export function situacionPorFecha(iso: string, resuelto: boolean): Urgencia | null {
  if (resuelto) return null;
  const dias = diasHastaVencimiento(iso);
  const rojo  = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
  const ambar = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  const gris  = 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-300';
  if (dias < 0) {
    const n = Math.abs(dias);
    return { label: `Vencido hace ${n} día${n === 1 ? '' : 's'}`, className: rojo, vencido: true };
  }
  if (dias === 0) return { label: 'Vence hoy', className: rojo, vencido: true };
  if (dias === 1) return { label: 'Vence mañana', className: ambar, vencido: false };
  if (dias <= 7)  return { label: `Faltan ${dias} días`, className: ambar, vencido: false };
  return { label: `Faltan ${dias} días`, className: gris, vencido: false };
}

/** Situación de un vencimiento. No muestra cuenta regresiva de lo ya resuelto:
 *  sería absurdo decir "vencido hace 12 días" de algo que no había que declarar. */
export function urgenciaVencimiento(iso: string, estado: EstadoVencimiento): Urgencia | null {
  return situacionPorFecha(iso, vencimientoResuelto(estado));
}

// ─── DV (idéntico al backend utils/nit.ts) ──────────────────────────────────────
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** Separa el NIT del DV cuando lo escriben con guion ("900.123.456-7"), igual
 *  que el backend: así la vista previa del DV coincide con lo que se guardará. */
export function separarNitDv(raw: string): { nit: string; dvExplicito: number | null } {
  const texto = String(raw ?? '').trim();
  const conGuion = /^(.*\d)\s*-\s*(\d)$/.exec(texto);
  if (conGuion) {
    const nit = conGuion[1].replace(/\D/g, '');
    if (nit) return { nit, dvExplicito: Number(conGuion[2]) };
  }
  return { nit: texto.replace(/\D/g, ''), dvExplicito: null };
}

export function calcularDV(nitCrudo: string): number | null {
  const { nit: limpio } = separarNitDv(nitCrudo || '');
  if (!limpio) return null;
  const digitos = limpio.split('').reverse().map(Number);
  const suma = digitos.reduce((acc, d, i) => acc + d * (PESOS[i] ?? 0), 0);
  const resto = suma % 11;
  return resto < 2 ? resto : 11 - resto;
}

// ─── Exclusión RST (idéntico al backend utils/calidades.ts) ─────────────────────
const INCOMPATIBLES_CON_RST: Calidad[] = ['declarante_renta', 'agente_retenedor'];

/** ¿Esta calidad no se puede marcar dado lo ya seleccionado? */
export function calidadBloqueada(codigo: Calidad, seleccionadas: Calidad[]): boolean {
  if (codigo === 'rst') return seleccionadas.some((c) => INCOMPATIBLES_CON_RST.includes(c));
  if (INCOMPATIBLES_CON_RST.includes(codigo)) return seleccionadas.includes('rst');
  return false;
}

/** Formato de identificación: 900123456-8 */
export function formatNit(nit: string, dv: number): string {
  return `${nit}-${dv}`;
}

/**
 * Formatea una fecha DIAN (columna @db.Date, serializada como medianoche UTC)
 * SIN correrla por zona horaria. formatDate() de utils la convierte a hora local
 * (Colombia UTC-5) y muestra el día anterior — inaceptable para un vencimiento
 * tributario. Aquí se fuerza timeZone UTC para mostrar el día de calendario real.
 */
export function formatFecha(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' }).format(d);
}

/** Resumen corto de calidades para la tabla: "IVA (bim.) · Renta". */
export function resumenCalidades(c: TaxClient): string {
  const partes = CALIDADES
    .filter((cal) => c.responsabilidades.includes(cal.codigo))
    .map((cal) => {
      if (cal.codigo === 'responsable_iva' && c.ivaPeriodicidad) {
        return `IVA (${c.ivaPeriodicidad === 'bimestral' ? 'bim.' : 'cuatr.'})`;
      }
      return cal.corto;
    });
  return partes.length ? partes.join(' · ') : 'Sin calidades';
}
