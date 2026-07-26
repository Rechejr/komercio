import { Calidad } from '@prisma/client';
import { normalizeHeader } from './excelParser';

// Mapeo de columnas para el import de clientes contables. Cada campo lista los
// encabezados que un contador puede traer en su Excel (con sinónimos y sin
// tildes — los encabezados se normalizan antes de comparar).
export const TAX_CLIENT_COL_DEFS: Record<string, string[]> = {
  razonSocial: ['razon social', 'razon', 'nombre', 'nombres', 'cliente', 'nombre completo',
                 'denominacion', 'empresa', 'contribuyente', 'nombre o razon social',
                 'nombres y apellidos', 'name'],
  // OJO con el orden: los específicos del NÚMERO van primero para que ganen sobre
  // "tipo identificacion" (que es el TIPO, no el número). Si no, el detector
  // agarraría la columna del tipo y todas las filas saldrían "sin NIT".
  nit:         ['numero identificacion', 'numero de identificacion', 'nro identificacion',
                 'nro. identificacion', 'no identificacion', 'no. identificacion',
                 'num identificacion', 'numero documento', 'numero de documento',
                 'num documento', 'num. documento', 'numero cedula', 'numero nit',
                 'nit', 'documento', 'identificacion', 'cedula', 'cc', 'rut', 'doc',
                 'nit / cedula', 'nit/cedula', 'id'],
  tipoPersona: ['tipo persona', 'tipo de persona', 'persona', 'tipo', 'naturaleza',
                 'tipo contribuyente', 'clase'],
  celular:     ['celular', 'telefono', 'tel', 'cel', 'movil', 'whatsapp', 'contacto',
                 'numero', 'phone'],
  direccion:   ['direccion', 'dir', 'domicilio', 'ubicacion', 'address', 'direccion fiscal'],
  calidades:   ['calidades', 'calidad', 'responsabilidades', 'responsabilidad',
                 'calidades tributarias', 'regimen', 'régimen', 'obligaciones',
                 'responsabilidad tributaria', 'condicion tributaria'],
  ivaPeriodicidad: ['periodicidad iva', 'periodicidad de iva', 'periodicidad', 'iva',
                 'periodo iva', 'declaracion iva'],
};

export const TAX_CLIENT_FIELD_LABELS: Record<string, string> = {
  razonSocial: 'Nombre / Razón social', nit: 'NIT / Cédula', tipoPersona: 'Tipo de persona',
  celular: 'Celular', direccion: 'Dirección', calidades: 'Calidades', ivaPeriodicidad: 'Periodicidad IVA',
};

// ── Tipo de persona ──────────────────────────────────────────────────────────
const NATURAL_TOKENS = ['natural', 'persona natural', 'pn', 'nat', 'n'];
const JURIDICA_TOKENS = ['juridica', 'persona juridica', 'pj', 'jur', 'j', 'sociedad', 'empresa'];

/** Interpreta el texto de la columna "tipo de persona". Devuelve null si no se
 *  puede determinar (el llamador aplica el valor por defecto). */
export function parseTipoPersona(raw: string): 'natural' | 'juridica' | null {
  const v = normalizeHeader(raw);
  if (!v) return null;
  if (NATURAL_TOKENS.includes(v)) return 'natural';
  if (JURIDICA_TOKENS.includes(v)) return 'juridica';
  // Coincidencia parcial (p. ej. "persona natural declarante")
  if (v.includes('natural')) return 'natural';
  if (v.includes('juridic')) return 'juridica';
  return null;
}

// ── Calidades tributarias ─────────────────────────────────────────────────────
// Se interpretan por texto (no por código RUT) para no arriesgar una mala
// clasificación tributaria: mejor detectar de más lo evidente y dejar que el
// contador revise en la vista previa, que inventar un código equivocado.
const CALIDAD_ALIASES: { calidad: Calidad; tokens: string[] }[] = [
  { calidad: 'responsable_iva',  tokens: ['responsable de iva', 'responsable iva', 'resp iva', 'iva', 'responsable'] },
  { calidad: 'declarante_renta', tokens: ['declarante de renta', 'declarante renta', 'declarante', 'renta'] },
  { calidad: 'agente_retenedor', tokens: ['agente retenedor', 'agente de retencion', 'retenedor', 'autorretenedor', 'retefuente', 'rete fuente', 'retencion'] },
  { calidad: 'impoconsumo',      tokens: ['impoconsumo', 'impuesto al consumo', 'impuesto nacional al consumo', 'consumo', 'inc'] },
  { calidad: 'rst',              tokens: ['regimen simple de tributacion', 'regimen simple', 'rst', 'simple'] },
];

/** Extrae las calidades de una celda de texto libre. Separa por , ; / | y saltos
 *  de línea, y mapea cada fragmento a una calidad conocida. */
export function parseCalidades(raw: string): Calidad[] {
  if (!raw) return [];
  const fragmentos = raw.split(/[,;/|\n]+/).map((f) => normalizeHeader(f)).filter(Boolean);
  const encontradas = new Set<Calidad>();
  for (const frag of fragmentos) {
    for (const { calidad, tokens } of CALIDAD_ALIASES) {
      if (tokens.some((t) => frag === t || frag.includes(t))) {
        encontradas.add(calidad);
        break;
      }
    }
  }
  return Array.from(encontradas);
}

/** Interpreta la periodicidad de IVA desde texto. */
export function parseIvaPeriodicidad(raw: string): 'bimestral' | 'cuatrimestral' | null {
  const v = normalizeHeader(raw);
  if (!v) return null;
  if (v.includes('bimestr')) return 'bimestral';
  if (v.includes('cuatrimestr')) return 'cuatrimestral';
  return null;
}
