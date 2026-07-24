/**
 * Semilla del calendario tributario DIAN 2026.
 *
 * NO transcribe las fechas a mano (la spec advierte que es peligroso): lee los
 * archivos SQL de referencia ya verificados contra el PDF oficial y los porta a
 * Postgres. La fuente son:
 *   agenda-contable-referencia/0007_calendario_dian.sql       (renta jurídica, IVA, retención)
 *   agenda-contable-referencia/0008_calendario_rst_naturales.sql (RST 'simple' + renta naturales)
 *
 * Idempotente: reemplaza por completo el año 2026, así se puede re-ejecutar sin
 * duplicar. Cada año se corre de nuevo con el decreto nuevo.
 *
 *   npm run db:seed-calendario
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ANIO = 2026;
const REF_DIR = join(__dirname, '..', '..', 'agenda-contable-referencia');

/** Divide el contenido de una tupla SQL en campos, respetando las comillas
 *  simples (una fecha o un periodo pueden contener comas o guiones). */
function parseTuple(inner: string): (string | number | null)[] {
  const fields: (string | number | null)[] = [];
  let i = 0;
  while (i < inner.length) {
    // Saltar espacios y la coma separadora.
    while (i < inner.length && (inner[i] === ' ' || inner[i] === ',')) i++;
    if (i >= inner.length) break;

    if (inner[i] === "'") {
      // Cadena entre comillas simples; '' es una comilla escapada.
      let s = '';
      i++;
      while (i < inner.length) {
        if (inner[i] === "'" && inner[i + 1] === "'") { s += "'"; i += 2; continue; }
        if (inner[i] === "'") { i++; break; }
        s += inner[i++];
      }
      fields.push(s);
    } else {
      // Número o NULL, hasta la próxima coma.
      let tok = '';
      while (i < inner.length && inner[i] !== ',') tok += inner[i++];
      tok = tok.trim();
      fields.push(tok.toUpperCase() === 'NULL' ? null : Number(tok));
    }
  }
  return fields;
}

/** Extrae todas las tuplas (…) de los INSERT que apuntan a `table`. */
function extractTuples(sql: string, table: string): (string | number | null)[][] {
  const tuples: (string | number | null)[][] = [];
  // Aísla cada bloque "INSERT INTO <table> ( … ) VALUES <tuplas> ;"
  const blockRe = new RegExp(`INSERT\\s+INTO\\s+${table}\\s*\\([^)]*\\)\\s*VALUES([\\s\\S]*?);`, 'gi');
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(sql)) !== null) {
    // Cada tupla es (...) — ningún campo contiene paréntesis, así que es seguro.
    const tupleRe = /\(([^)]*)\)/g;
    let m: RegExpExecArray | null;
    while ((m = tupleRe.exec(block[1])) !== null) {
      tuples.push(parseTuple(m[1]));
    }
  }
  return tuples;
}

async function main() {
  const sql0007 = readFileSync(join(REF_DIR, '0007_calendario_dian.sql'), 'utf8');
  const sql0008 = readFileSync(join(REF_DIR, '0008_calendario_rst_naturales.sql'), 'utf8');

  // ── calendario_dian: (obligacion, variante, periodo, periodo_orden, digito, fecha)
  const dianTuples = [
    ...extractTuples(sql0007, 'calendario_dian'),
    ...extractTuples(sql0008, 'calendario_dian'),
  ];
  const dianRows = dianTuples.map((t) => {
    const [obligacion, variante, periodo, periodoOrden, digito, fecha] = t;
    return {
      anio: ANIO,
      obligacion: String(obligacion),
      variante: variante === null ? null : String(variante),
      periodo: String(periodo),
      periodoOrden: Number(periodoOrden),
      digito: Number(digito),
      fecha: new Date(`${fecha}T00:00:00Z`),
    };
  });

  // ── calendario_renta_natural: (dos_digitos, fecha)
  const rnTuples = extractTuples(sql0008, 'calendario_renta_natural');
  const rnRows = rnTuples.map((t) => {
    const [dosDigitos, fecha] = t;
    return { anio: ANIO, dosDigitos: Number(dosDigitos), fecha: new Date(`${fecha}T00:00:00Z`) };
  });

  // ── Validaciones básicas antes de escribir ──────────────────────────────────
  const bad = dianRows.find(
    (r) => Number.isNaN(r.digito) || r.digito < 0 || r.digito > 9 || Number.isNaN(r.fecha.getTime()),
  );
  if (bad) throw new Error(`Fila de calendario_dian inválida: ${JSON.stringify(bad)}`);
  const badRn = rnRows.find(
    (r) => Number.isNaN(r.dosDigitos) || r.dosDigitos < 0 || r.dosDigitos > 99 || Number.isNaN(r.fecha.getTime()),
  );
  if (badRn) throw new Error(`Fila de renta natural inválida: ${JSON.stringify(badRn)}`);
  if (rnRows.length !== 100) {
    throw new Error(`Se esperaban 100 filas de renta natural (00–99), se parsearon ${rnRows.length}`);
  }

  console.log(`Parseado: ${dianRows.length} filas calendario_dian, ${rnRows.length} filas renta natural`);
  const porObligacion = dianRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.obligacion] = (acc[r.obligacion] || 0) + 1;
    return acc;
  }, {});
  console.log('  por obligación:', JSON.stringify(porObligacion));

  // ── Escritura idempotente: reemplaza el año 2026 completo ────────────────────
  await prisma.$transaction([
    prisma.calendarioDian.deleteMany({ where: { anio: ANIO } }),
    prisma.calendarioDian.createMany({ data: dianRows }),
    prisma.calendarioRentaNatural.deleteMany({ where: { anio: ANIO } }),
    prisma.calendarioRentaNatural.createMany({ data: rnRows }),
  ]);

  console.log(`✔ Calendario ${ANIO} sembrado.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
