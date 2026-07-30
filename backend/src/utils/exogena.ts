// Calendario de la Información Exógena (formatos 1001, 1005, etc.).
//
// A diferencia de PILA —que sigue una REGLA fija y se calcula— los plazos de
// exógena los fija cada año un decreto sin fórmula, así que se listan a mano por
// año. Aplican por los DOS ÚLTIMOS dígitos del NIT, en grupos de 5, IGUAL para
// personas jurídicas y naturales (no grandes contribuyentes).
//
// Fuente 2026 (reporte del año gravable 2025): DIAN / actualicese.com
// (plazos-para-reportar-informacion-exogena-en-2026). Transcrito y verificado
// franja por franja contra la tabla oficial.
//
// Nota: como los plazos pueden cambiar por decreto, la fecha auto-calculada queda
// EDITABLE en el formulario (igual que PILA). Cada año se agrega el decreto nuevo.

import { dosUltimosDigitos } from './nit';

// 20 franjas de 5 (01-05, 06-10, …, 91-95, 96-00) → fecha límite 2026.
const FECHAS_EXOGENA_2026 = [
  '2026-05-14', // 01-05
  '2026-05-15', // 06-10
  '2026-05-19', // 11-15
  '2026-05-20', // 16-20
  '2026-05-21', // 21-25
  '2026-05-22', // 26-30
  '2026-05-25', // 31-35
  '2026-05-26', // 36-40
  '2026-05-27', // 41-45
  '2026-05-28', // 46-50
  '2026-05-29', // 51-55
  '2026-06-01', // 56-60
  '2026-06-02', // 61-65
  '2026-06-03', // 66-70
  '2026-06-04', // 71-75
  '2026-06-05', // 76-80
  '2026-06-09', // 81-85
  '2026-06-10', // 86-90
  '2026-06-11', // 91-95
  '2026-06-12', // 96-00
];

export interface PeriodoExogena {
  periodo: string;
  fecha: Date;
}

/** El único vencimiento anual de exógena para un NIT: la fecha la define la franja
 *  de los dos últimos dígitos. Devuelve [] si no hay calendario cargado para el año. */
export function periodosExogena(nit: string, year: number): PeriodoExogena[] {
  if (year !== 2026) return []; // por ahora solo está cargado el calendario 2026
  const dd = dosUltimosDigitos(nit); // 0..99
  // Franja de 5: 01-05→0, 06-10→1, …, 91-95→18, y 96-99/00→19.
  const idx = (dd === 0 || dd >= 96) ? 19 : Math.floor((dd - 1) / 5);
  return [{ periodo: 'Año gravable 2025', fecha: new Date(`${FECHAS_EXOGENA_2026[idx]}T00:00:00Z`) }];
}
