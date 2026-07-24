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
  | 'renta' | 'iva' | 'retefuente' | 'ica' | 'exogena' | 'pila' | 'impoconsumo' | 'simple';

export type EstadoVencimiento = 'pendiente' | 'en_proceso' | 'presentada' | 'pagada' | 'vencida';

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
];

export const ESTADO_COLOR: Record<EstadoVencimiento, string> = {
  pendiente:  'bg-slate-100 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
  en_proceso: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  presentada: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
  pagada:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  vencida:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

// ─── DV (idéntico al backend utils/nit.ts) ──────────────────────────────────────
const PESOS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
export function calcularDV(nitCrudo: string): number | null {
  const limpio = (nitCrudo || '').replace(/\D/g, '');
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
