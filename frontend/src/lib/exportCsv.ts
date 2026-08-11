// Exporta filas a un CSV que Excel abre bien en español: lleva BOM UTF-8 (para
// que las tildes/ñ no se dañen) y usa ';' como separador de campos, que es el
// que Excel espera cuando la coma es el separador decimal (configuración es-CO).
// Los montos van como números enteros sin formato para que Excel los sume.
export function downloadCsv(
  filename: string,
  headers: string[],
  rows: (string | number)[][],
) {
  const esc = (v: string | number) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...rows]
    .map((r) => r.map(esc).join(';'))
    .join('\r\n');
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  try { a.click(); } finally { a.remove(); }
  URL.revokeObjectURL(url);
}
