import ExcelJS from 'exceljs';

export function normalizeHeader(str: string): string {
  return str.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Returns the worksheet with the most data.
 * Handles Excel files that have a cover/logo sheet as the first sheet.
 */
export function findDataSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  if (!wb.worksheets.length) throw new Error('El archivo no contiene hojas de cálculo');
  if (wb.worksheets.length === 1) return wb.worksheets[0];
  return wb.worksheets.reduce(
    (best, ws) => ws.rowCount > best.rowCount ? ws : best,
    wb.worksheets[0],
  );
}

/**
 * Scans rows 1–10 to find the actual header row.
 * Returns the 1-based row index with the highest alias-match score.
 * Handles files where row 1 is a title, logo placeholder, or blank.
 */
export function findHeaderRow(ws: ExcelJS.Worksheet, allAliases: string[]): number {
  const aliasSet = new Set(allAliases);
  let bestRow = 1;
  let bestScore = 0;
  const limit = Math.min(ws.rowCount, 10);

  for (let r = 1; r <= limit; r++) {
    let score = 0;
    ws.getRow(r).eachCell((cell) => {
      const v = normalizeHeader(String(cell.value ?? ''));
      if (!v) return;
      if (aliasSet.has(v)) { score += 2; return; }
      for (const a of allAliases) {
        if (v.includes(a) || a.includes(v)) { score += 1; break; }
      }
    });
    if (score > bestScore) { bestScore = score; bestRow = r; }
  }
  return bestRow;
}

/**
 * Two-pass column mapper: exact match first, then "contains" fallback.
 * No column is claimed twice. Returns 1-based ExcelJS column indexes.
 */
export function mapColumns(
  headers: string[],
  colDefs: Record<string, string[]>,
): { col: Record<string, number>; detectedColumns: { field: string; header: string }[] } {
  const claimedCols = new Map<number, string>();
  const col: Record<string, number> = {};
  for (const f of Object.keys(colDefs)) col[f] = -1;

  for (const [field, aliases] of Object.entries(colDefs)) {
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i >= 0 && !claimedCols.has(i)) {
        claimedCols.set(i, field);
        col[field] = i + 1;
        break;
      }
    }
  }

  for (const [field, aliases] of Object.entries(colDefs)) {
    if (col[field] !== -1) continue;
    for (const a of aliases) {
      const i = headers.findIndex((h, idx) => h.includes(a) && !claimedCols.has(idx));
      if (i >= 0) {
        claimedCols.set(i, field);
        col[field] = i + 1;
        break;
      }
    }
  }

  const detectedColumns = Array.from(claimedCols.entries()).map(([idx, field]) => ({
    field,
    header: headers[idx],
  }));

  return { col, detectedColumns };
}

/** Safe cell value extraction. Handles formulas (returns result), rich text, plain values. */
export function cellVal(row: ExcelJS.Row, colIndex: number): string {
  if (colIndex === -1) return '';
  const v = row.getCell(colIndex).value;
  if (v === null || v === undefined) return '';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof v === 'object' && 'result' in (v as any)) return String((v as any).result ?? '').trim();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text ?? '').trim();
  return String(v).trim();
}

/**
 * Parses numbers in both Colombian "1.234,56" and English "1,234.56" formats.
 * Strips currency symbols, spaces, etc.
 */
export function parseNum(raw: string): number {
  const s = raw.replace(/[^0-9.,-]/g, '');
  if (!s) return 0;
  const normalized = s.includes(',') && s.includes('.')
    ? (s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, ''))
    : s.replace(',', '.');
  return parseFloat(normalized) || 0;
}

/**
 * Normalizes Colombian phone numbers.
 * - Strips spaces, dashes, parentheses, dots
 * - Removes +57 / 57 country prefix when total length would be 12 digits
 * - Returns null if result has fewer than 7 digits (invalid)
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let clean = digits;
  if (clean.startsWith('57') && clean.length === 12) clean = clean.slice(2);
  else if (clean.startsWith('0') && clean.length > 7) clean = clean.slice(1);
  if (clean.length < 7) return raw.trim() || null;
  return clean.slice(0, 10);
}

/**
 * Cleans document / NIT numbers.
 * Strips dots and spaces. Preserves dashes (NIT digit-verifier: 900123456-7).
 */
export function normalizeDocument(raw: string): string {
  return raw.trim().replace(/[\s.]/g, '');
}

/** Basic email format check */
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}
