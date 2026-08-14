import { Response, NextFunction } from 'express';
import { Prisma, Calidad, Obligacion, TipoRespManual, EstadoRespManual } from '@prisma/client';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { success, created, paginated, AppError } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { calcularDV, soloDigitos, ultimoDigito, dosUltimosDigitos } from '../utils/nit';
import { normalizarResponsabilidades, obligacionesSugeridas } from '../utils/calidades';
import { periodosPila, periodosNomina } from '../utils/pila';
import { periodosExogena } from '../utils/exogena';
import { encrypt, decrypt } from '../utils/crypto';
import { uploadDocument, deleteImage } from '../config/cloudinary';
import ExcelJS from 'exceljs';
import { findDataSheet, findHeaderRow, mapColumns, cellVal, normalizeHeader } from '../utils/excelParser';
import {
  TAX_CLIENT_COL_DEFS, TAX_CLIENT_FIELD_LABELS,
  parseTipoPersona, parseCalidades, parseIvaPeriodicidad,
} from '../utils/contableImport';

// Año del calendario tributario en uso. Cada año la DIAN publica un decreto
// nuevo: se siembra ese calendario (ver seedCalendario.ts) y se apunta aquí el
// año — configurable por env para NO tocar código cada año. Default 2026, el
// único sembrado hoy. Al pasar a 2027: sembrar el calendario 2027 (con periodos
// que incluyan el año para no chocar con los bimestres 2026 en el índice único
// [taxClientId, obligacion, periodo]) y setear ANIO_CALENDARIO=2027 en el env.
const ANIO_CALENDARIO = Number(process.env.ANIO_CALENDARIO) || 2026;

/** Confirma que un TaxClient existe y pertenece a ESTA oficina. Devuelve el
 *  cliente o lanza 404 — nunca revela la existencia de clientes de otra oficina. */
async function getClientOfBusiness(taxClientId: string, businessId: string) {
  const client = await prisma.taxClient.findFirst({
    where: { id: taxClientId, businessId },
  });
  if (!client) throw new AppError('Cliente no encontrado', 404);
  return client;
}

// ── Validadores de entrada ────────────────────────────────────────────────────
// Convierten datos crudos del body en valores seguros para Prisma, lanzando 400
// con mensaje claro en vez de dejar que un valor basura reviente en un 500.

/** Fecha "AAAA-MM-DD" (input date) → Date UTC. 400 si el formato o el día no son válidos. */
function fechaValida(fecha: unknown, campo = 'fecha'): Date {
  if (typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new AppError(`La ${campo} no tiene un formato válido (AAAA-MM-DD)`, 400);
  }
  const d = new Date(`${fecha}T00:00:00Z`);
  // Ida y vuelta: rechaza días que JS "corre" (30-feb → 2-mar) y fechas inválidas.
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== fecha) {
    throw new AppError(`La ${campo} no es una fecha válida`, 400);
  }
  return d;
}

/** Monto opcional → Decimal ≥ 0 o null. 400 si no es número o es negativo. */
function montoValido(monto: unknown, campo = 'monto'): Prisma.Decimal | null {
  if (monto == null || monto === '') return null;
  let dec: Prisma.Decimal;
  try { dec = new Prisma.Decimal(monto as Prisma.Decimal.Value); }
  catch { throw new AppError(`El ${campo} no es un número válido`, 400); }
  if (!dec.isFinite() || dec.isNegative()) throw new AppError(`El ${campo} debe ser un número positivo`, 400);
  return dec;
}

/** Entero opcional ≥ 0 o null. 400 si no es un entero válido. */
function enteroValido(v: unknown, campo: string): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new AppError(`El ${campo} debe ser un número entero positivo`, 400);
  return n;
}

const OBLIGACIONES_VALIDAS: Obligacion[] = ['renta', 'iva', 'retefuente', 'ica', 'exogena', 'pila', 'impoconsumo', 'simple'];

/** ¿La suscripción/prueba está vigente? requireContable deja planExpiresAt en req.
 *  La purga perezosa solo debe correr con plan activo: si venció, la agenda queda
 *  en solo-lectura y sus datos NO se tocan. */
function planActivo(req: AuthRequest): boolean {
  const exp = (req as AuthRequest & { planExpiresAt?: Date | null }).planExpiresAt;
  return exp != null && new Date(exp) > new Date();
}

// Tope de seguridad para listados sin paginar (evita respuestas gigantes en memoria).
// Muy por encima del volumen real de una oficina; si se acerca, toca paginar.
const LIST_CAP = 2000;

/** Variante del calendario según la obligación y el cliente:
 *  IVA → periodicidad; renta → tipo de persona; el resto no tiene variante. */
function varianteDe(obligacion: Obligacion, tipoPersona: string, ivaPeriodicidad: string | null): string | null {
  if (obligacion === 'iva') return ivaPeriodicidad;
  if (obligacion === 'renta') return tipoPersona;
  return null;
}

/** Periodos del calendario DIAN para una obligación y un NIT, con la fecha ya
 *  resuelta. Maneja los dos mecanismos: por último dígito (la mayoría) y por los
 *  dos últimos (renta de personas naturales). Porta periodosCalendario() de la
 *  app de referencia. */
async function periodosCalendario(obligacion: Obligacion, variante: string | null, nit: string) {
  // PILA no se siembra: se calcula (N-ésimo día hábil del mes según los 2 últimos
  // dígitos). Ver utils/pila.ts — validado vs. miplanilla.com.
  if (obligacion === 'pila') return periodosPila(nit, ANIO_CALENDARIO);
  if (obligacion === 'nomina') return periodosNomina(ANIO_CALENDARIO);
  // Exógena: un vencimiento anual, fecha por los dos últimos dígitos (util, no tabla).
  if (obligacion === 'exogena') return periodosExogena(nit, ANIO_CALENDARIO);
  if (obligacion === 'renta' && variante === 'natural') {
    const row = await prisma.calendarioRentaNatural.findUnique({
      where: { anio_dosDigitos: { anio: ANIO_CALENDARIO, dosDigitos: dosUltimosDigitos(nit) } },
    });
    return row ? [{ periodo: 'Año 2025', fecha: row.fecha }] : [];
  }
  const rows = await prisma.calendarioDian.findMany({
    where: { anio: ANIO_CALENDARIO, obligacion, variante, digito: ultimoDigito(nit) },
    orderBy: { periodoOrden: 'asc' },
    select: { periodo: true, fecha: true },
  });
  return rows;
}

function diasDesdeHoy(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d;
}

/** Genera en LOTE los vencimientos derivados de las calidades de varios clientes
 *  (para el import masivo). Carga el calendario en memoria UNA vez y hace un solo
 *  createMany, en vez de consultar por cliente. Solo obligaciones de calidades
 *  (renta, iva, retefuente, impoconsumo, simple); PILA/exógena no se auto-generan. */
async function generarAgendaBatch(
  clientes: Array<{ taxClientId: string; nit: string; tipoPersona: string; ivaPeriodicidad: string | null; responsabilidades: Calidad[] }>,
): Promise<number> {
  const conCalidades = clientes.filter((c) => c.responsabilidades.length > 0);
  if (conCalidades.length === 0) return 0;

  const dianRows = await prisma.calendarioDian.findMany({
    where: { anio: ANIO_CALENDARIO },
    select: { obligacion: true, variante: true, digito: true, periodo: true, fecha: true },
    orderBy: { periodoOrden: 'asc' },
  });
  const dianMap = new Map<string, { periodo: string; fecha: Date }[]>();
  for (const row of dianRows) {
    const key = `${row.obligacion}|${row.variante ?? ''}|${row.digito}`;
    const list = dianMap.get(key) ?? [];
    list.push({ periodo: row.periodo, fecha: row.fecha });
    dianMap.set(key, list);
  }
  const rentaNatRows = await prisma.calendarioRentaNatural.findMany({
    where: { anio: ANIO_CALENDARIO },
    select: { dosDigitos: true, fecha: true },
  });
  const rentaNatMap = new Map<number, Date>(rentaNatRows.map((r) => [r.dosDigitos, r.fecha]));

  const filas: { taxClientId: string; obligacion: Obligacion; periodo: string; fecha: Date }[] = [];
  for (const c of conCalidades) {
    for (const obl of obligacionesSugeridas(c.responsabilidades, [])) {
      if (obl === 'renta' && c.tipoPersona === 'natural') {
        const fecha = rentaNatMap.get(dosUltimosDigitos(c.nit));
        if (fecha) filas.push({ taxClientId: c.taxClientId, obligacion: obl, periodo: 'Año 2025', fecha });
        continue;
      }
      const variante = varianteDe(obl, c.tipoPersona, c.ivaPeriodicidad);
      const periodos = dianMap.get(`${obl}|${variante ?? ''}|${ultimoDigito(c.nit)}`) ?? [];
      for (const p of periodos) filas.push({ taxClientId: c.taxClientId, obligacion: obl, periodo: p.periodo, fecha: p.fecha });
    }
  }
  if (filas.length === 0) return 0;
  const res = await prisma.vencimiento.createMany({ data: filas, skipDuplicates: true });
  return res.count;
}

export const contableController = {
  // ─── CLIENTES ────────────────────────────────────────────────────────────────
  async listClients(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { page, limit, skip } = getPagination(req);
      const search = (req.query.search as string)?.trim();

      const where: Prisma.TaxClientWhereInput = { businessId, activo: true };
      if (search) {
        // Buscar por razón social o por NIT (con o sin el guion del DV).
        const soloNum = soloDigitos(search);
        where.OR = [
          { razonSocial: { contains: search, mode: 'insensitive' } },
          ...(soloNum ? [{ nit: { contains: soloNum } }] : []),
        ];
      }

      const [items, total] = await Promise.all([
        prisma.taxClient.findMany({ where, skip, take: limit, orderBy: { razonSocial: 'asc' } }),
        prisma.taxClient.count({ where }),
      ]);
      return paginated(res, items, total, page, limit);
    } catch (err) { next(err); }
  },

  async createClient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { razonSocial, nit, celular, direccion, tipoPersona, responsabilidades, ivaPeriodicidad } = req.body;

      if (!razonSocial?.trim()) throw new AppError('La razón social es requerida', 400);
      const nitLimpio = soloDigitos(nit || '');
      if (!nitLimpio) throw new AppError('El NIT es requerido', 400);
      if (tipoPersona !== 'natural' && tipoPersona !== 'juridica') {
        throw new AppError('Tipo de persona inválido', 400);
      }

      const calidades = normalizarResponsabilidades(responsabilidades);
      // La periodicidad de IVA solo aplica si es responsable de IVA.
      const ivaPer = calidades.includes('responsable_iva')
        ? (ivaPeriodicidad === 'bimestral' || ivaPeriodicidad === 'cuatrimestral' ? ivaPeriodicidad : null)
        : null;
      const dv = calcularDV(nitLimpio);

      try {
        const client = await prisma.taxClient.create({
          data: {
            businessId,
            razonSocial: razonSocial.trim(),
            nit: nitLimpio,
            dv,
            celular: celular?.trim() || null,
            direccion: direccion?.trim() || null,
            tipoPersona,
            responsabilidades: calidades,
            ivaPeriodicidad: ivaPer,
          },
        });
        return created(res, client, 'Cliente creado');
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppError('Ya tienes un cliente registrado con ese NIT', 409);
        }
        throw e;
      }
    } catch (err) { next(err); }
  },

  async updateClient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const clienteAntes = await getClientOfBusiness(req.params.id, businessId);
      const calidadesAntes = clienteAntes.responsabilidades as Calidad[];

      const { razonSocial, nit, celular, direccion, tipoPersona, responsabilidades, ivaPeriodicidad } = req.body;
      if (!razonSocial?.trim()) throw new AppError('La razón social es requerida', 400);
      const nitLimpio = soloDigitos(nit || '');
      if (!nitLimpio) throw new AppError('El NIT es requerido', 400);
      if (tipoPersona !== 'natural' && tipoPersona !== 'juridica') {
        throw new AppError('Tipo de persona inválido', 400);
      }

      const calidades = normalizarResponsabilidades(responsabilidades);
      const ivaPer = calidades.includes('responsable_iva')
        ? (ivaPeriodicidad === 'bimestral' || ivaPeriodicidad === 'cuatrimestral' ? ivaPeriodicidad : null)
        : null;

      // ── Reconciliación de vencimientos según el cambio de calidades ──────────
      // Si el cliente gana/pierde una obligación DERIVADA DE CALIDADES (renta, iva,
      // retefuente, impoconsumo, simple), sus vencimientos se ajustan solos. ICA,
      // PILA y exógena NO se tocan (son manuales/independientes).
      const oblAntes = new Set(obligacionesSugeridas(calidadesAntes, []));
      const oblAhora = new Set(obligacionesSugeridas(calidades, []));
      const quitadas = [...oblAntes].filter((o) => !oblAhora.has(o));
      const agregadas = [...oblAhora].filter((o) => !oblAntes.has(o));

      // Los vencimientos a crear se calculan ANTES de la transacción (leer el
      // calendario es lectura de datos estáticos). Se usan los valores NUEVOS.
      const nuevos: { obligacion: Obligacion; periodo: string; fecha: Date }[] = [];
      for (const obl of agregadas) {
        const variante = varianteDe(obl, tipoPersona, ivaPer);
        const periodos = await periodosCalendario(obl, variante, nitLimpio);
        for (const p of periodos) nuevos.push({ obligacion: obl, periodo: p.periodo, fecha: p.fecha });
      }

      try {
        const client = await prisma.$transaction(async (tx) => {
          const c = await tx.taxClient.update({
            where: { id: req.params.id },
            data: {
              razonSocial: razonSocial.trim(),
              nit: nitLimpio,
              dv: calcularDV(nitLimpio),
              celular: celular?.trim() || null,
              direccion: direccion?.trim() || null,
              tipoPersona,
              responsabilidades: calidades,
              ivaPeriodicidad: ivaPer,
            },
          });

          // Quitar por completo las obligaciones que ya no aplican: se borran TODOS
          // sus vencimientos, incluso los ya Presentada/Pagada (decisión del contador:
          // que la obligación desaparezca por completo al cambiar las calidades).
          if (quitadas.length) {
            await tx.vencimiento.deleteMany({
              where: {
                taxClientId: c.id,
                obligacion: { in: quitadas },
              },
            });
          }

          // Agregar los vencimientos de las obligaciones nuevas (ignora duplicados).
          if (nuevos.length) {
            await tx.vencimiento.createMany({
              data: nuevos.map((n) => ({ taxClientId: c.id, ...n })),
              skipDuplicates: true,
            });
          }

          return c;
        });
        return success(res, client, 'Cliente actualizado');
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppError('Ya tienes un cliente registrado con ese NIT', 409);
        }
        throw e;
      }
    } catch (err) { next(err); }
  },

  // Solo ADMIN (el dueño). El AUXILIAR no elimina clientes — lo aplica el router.
  async deleteClient(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      await getClientOfBusiness(req.params.id, businessId);
      // Vencimientos y resoluciones caen por la cascada declarada en el schema.
      await prisma.taxClient.delete({ where: { id: req.params.id } });
      return success(res, null, 'Cliente eliminado');
    } catch (err) { next(err); }
  },

  /** Importación masiva de clientes desde Excel/CSV. Soporta ?dryRun=true para
   *  una vista previa antes de escribir. Cada cliente se crea EXACTAMENTE como
   *  lo haría createClient (DV por fórmula DIAN, exclusión RST, IVA solo si es
   *  responsable). Upsert por NIT dentro de la misma oficina. */
  async importClients(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new AppError('Archivo requerido', 400);
      const dryRun = req.query.dryRun === 'true';
      const businessId = req.user!.businessId!;

      const wb = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wb.xlsx.load as any)(req.file.buffer);
      const ws = findDataSheet(wb);

      const allAliases = Object.values(TAX_CLIENT_COL_DEFS).flat();
      const headerRowNum = findHeaderRow(ws, allAliases);

      const headers: string[] = [];
      ws.getRow(headerRowNum).eachCell((cell) => {
        headers.push(normalizeHeader(String(cell.value ?? '')));
      });

      const { col, detectedColumns } = mapColumns(headers, TAX_CLIENT_COL_DEFS);

      if (col.razonSocial === -1) {
        throw new AppError(
          'No se encontró la columna del nombre. Asegúrate de tener una columna "Nombre" o "Razón social".',
          400,
        );
      }
      if (col.nit === -1) {
        throw new AppError(
          'No se encontró la columna del NIT/cédula. Es obligatoria para calcular el dígito de verificación.',
          400,
        );
      }

      const detectedColumnsLabeled = detectedColumns.map((d) => ({
        field: d.field,
        header: `${d.header} → ${TAX_CLIENT_FIELD_LABELS[d.field] ?? d.field}`,
      }));

      interface ParsedRow {
        rowNum: number;
        razonSocial: string;
        nit: string;
        dv: number;
        tipoPersona: 'natural' | 'juridica';
        celular: string | null;
        direccion: string | null;
        responsabilidades: ReturnType<typeof normalizarResponsabilidades>;
        ivaPeriodicidad: 'bimestral' | 'cuatrimestral' | null;
      }
      type RowIssue = { row: number; name: string; message: string; type: 'error' | 'warning' };

      const issues: RowIssue[] = [];
      const validRows: ParsedRow[] = [];
      const seenNits = new Map<string, number>();
      let totalRows = 0;

      const tieneColTipo = col.tipoPersona !== -1;

      // Tope de filas: evita que un archivo gigante genere miles de queries y
      // tumbe el request. Las filas de más se avisan y se ignoran.
      const MAX_IMPORT_ROWS = 5000;
      const ultimaFila = Math.min(ws.rowCount, headerRowNum + MAX_IMPORT_ROWS);

      for (let rowNum = headerRowNum + 1; rowNum <= ultimaFila; rowNum++) {
        const row = ws.getRow(rowNum);
        const razonSocial = cellVal(row, col.razonSocial);
        if (!razonSocial) continue;
        totalRows++;

        const nit = soloDigitos(cellVal(row, col.nit));
        if (!nit) {
          issues.push({ row: rowNum, name: razonSocial, message: 'Sin NIT/cédula — no se puede importar', type: 'error' });
          continue;
        }

        // NIT duplicado dentro del archivo → gana la primera fila, se avisa.
        if (seenNits.has(nit)) {
          issues.push({
            row: rowNum, name: razonSocial,
            message: `NIT ${nit} repetido (ya aparece en la fila ${seenNits.get(nit)})`,
            type: 'warning',
          });
          continue;
        }
        seenNits.set(nit, rowNum);

        // Tipo de persona: se interpreta la columna; si falta o no se entiende,
        // se asume Jurídica y se avisa (afecta el calendario de renta).
        let tipoPersona: 'natural' | 'juridica' = 'juridica';
        if (tieneColTipo) {
          const parsed = parseTipoPersona(cellVal(row, col.tipoPersona));
          if (parsed) tipoPersona = parsed;
          else if (cellVal(row, col.tipoPersona)) {
            issues.push({ row: rowNum, name: razonSocial, message: 'Tipo de persona no reconocido — se asumió Jurídica', type: 'warning' });
          }
        }

        const responsabilidades = normalizarResponsabilidades(parseCalidades(cellVal(row, col.calidades)));
        const ivaPeriodicidad = responsabilidades.includes('responsable_iva')
          ? parseIvaPeriodicidad(cellVal(row, col.ivaPeriodicidad))
          : null;

        validRows.push({
          rowNum, razonSocial, nit, dv: calcularDV(nit),
          tipoPersona,
          celular: cellVal(row, col.celular) || null,
          direccion: cellVal(row, col.direccion) || null,
          responsabilidades,
          ivaPeriodicidad,
        });
      }

      if (ws.rowCount > ultimaFila) {
        issues.unshift({
          row: ultimaFila, name: '',
          message: `El archivo supera las ${MAX_IMPORT_ROWS} filas; solo se procesaron las primeras ${MAX_IMPORT_ROWS}. Divídelo en varios archivos.`,
          type: 'warning',
        });
      }

      // Si no vino columna de tipo de persona, un solo aviso global (no por fila).
      if (!tieneColTipo && validRows.length > 0) {
        issues.unshift({
          row: headerRowNum, name: '',
          message: 'No se detectó la columna "Tipo de persona": todos se asumieron Jurídica. Revísalo si tienes personas naturales.',
          type: 'warning',
        });
      }

      if (dryRun) {
        const nitsInFile = validRows.map((r) => r.nit);
        const existing = nitsInFile.length > 0
          ? await prisma.taxClient.findMany({
              where: { businessId, nit: { in: nitsInFile } },
              select: { nit: true },
            })
          : [];
        const existingNits = new Set(existing.map((c) => c.nit));

        return success(res, {
          total: totalRows,
          valid: validRows.length,
          toCreate: validRows.filter((r) => !existingNits.has(r.nit)).length,
          toUpdate: validRows.filter((r) => existingNits.has(r.nit)).length,
          issues,
          detectedColumns: detectedColumnsLabeled,
        }, 'Vista previa generada');
      }

      // ── Importación real ─────────────────────────────────────────────────────
      const results = {
        imported: 0,
        updated: 0,
        generados: 0,
        errors: issues
          .filter((i) => i.type === 'error')
          .map((i) => ({ row: i.row, message: `"${i.name}": ${i.message}` })),
      };

      const clientesParaAgenda: Array<{ taxClientId: string; nit: string; tipoPersona: string; ivaPeriodicidad: string | null; responsabilidades: Calidad[] }> = [];
      for (const r of validRows) {
        try {
          const data = {
            razonSocial: r.razonSocial,
            nit: r.nit,
            dv: r.dv,
            celular: r.celular,
            direccion: r.direccion,
            tipoPersona: r.tipoPersona,
            responsabilidades: r.responsabilidades,
            ivaPeriodicidad: r.ivaPeriodicidad,
          };
          const existing = await prisma.taxClient.findFirst({
            where: { businessId, nit: r.nit },
            select: { id: true },
          });
          let taxClientId: string;
          if (existing) {
            await prisma.taxClient.update({ where: { id: existing.id }, data: { ...data, activo: true } });
            taxClientId = existing.id;
            results.updated++;
          } else {
            const nuevo = await prisma.taxClient.create({ data: { ...data, businessId } });
            taxClientId = nuevo.id;
            results.imported++;
          }
          clientesParaAgenda.push({
            taxClientId, nit: r.nit, tipoPersona: r.tipoPersona,
            ivaPeriodicidad: r.ivaPeriodicidad, responsabilidades: r.responsabilidades,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido';
          results.errors.push({ row: r.rowNum, message: `"${r.razonSocial}": ${msg}` });
        }
      }

      // Genera automáticamente la agenda (vencimientos) según las calidades importadas:
      // un responsable de IVA queda listo en la pestaña de IVA sin generar a mano. Los
      // que ya existan no se duplican (skipDuplicates).
      results.generados = await generarAgendaBatch(clientesParaAgenda).catch(() => 0);

      return success(res, results, `Importación: ${results.imported} creados, ${results.updated} actualizados${results.generados ? `, ${results.generados} vencimientos generados` : ''}`);
    } catch (err) { next(err); }
  },

  /** Obligaciones que le faltan al cliente según sus calidades (§5.5). */
  async clientSuggestions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const client = await getClientOfBusiness(req.params.id, businessId);
      const registradas = await prisma.vencimiento.findMany({
        where: { taxClientId: client.id },
        select: { obligacion: true },
        distinct: ['obligacion'],
      });
      const sugeridas = obligacionesSugeridas(
        client.responsabilidades as Calidad[],
        registradas.map((r) => r.obligacion),
      );
      return success(res, sugeridas);
    } catch (err) { next(err); }
  },

  // ─── CALENDARIO (fecha automática por NIT) ─────────────────────────────────────
  async periodos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const obligacion = req.query.obligacion as Obligacion;
      if (!obligacion) throw new AppError('Falta la obligación', 400);

      const client = await getClientOfBusiness(req.query.taxClientId as string, businessId);
      const variante = varianteDe(obligacion, client.tipoPersona, client.ivaPeriodicidad);
      const periodos = await periodosCalendario(obligacion, variante, client.nit);
      // periodos = [] cuando la obligación no tiene calendario (ICA, exógena) →
      // el frontend deja la fecha en modo manual. PILA sí trae fechas (calculadas).
      return success(res, periodos);
    } catch (err) { next(err); }
  },

  // ─── VENCIMIENTOS ──────────────────────────────────────────────────────────────
  async listVencimientos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const obligacion = req.query.obligacion as Obligacion | undefined;
      const search = (req.query.search as string)?.trim();

      // Auto-borrado: los ya cumplidos (presentada/pagada) se borran 2 meses
      // después de su fecha, para no saturar. Lo pendiente/vencido se conserva.
      // Solo con plan activo: en modo solo-lectura (vencido) sus datos no se tocan.
      if (planActivo(req)) {
        const corte = new Date();
        corte.setMonth(corte.getMonth() - 2);
        await prisma.vencimiento.deleteMany({
          where: { taxClient: { businessId }, estado: { in: ['presentada', 'pagada'] }, fecha: { lt: corte } },
        });
      }

      const where: Prisma.VencimientoWhereInput = { taxClient: { businessId } };
      if (obligacion) where.obligacion = obligacion;
      if (search) {
        const soloNum = soloDigitos(search);
        where.taxClient = {
          businessId,
          OR: [
            { razonSocial: { contains: search, mode: 'insensitive' } },
            ...(soloNum ? [{ nit: { contains: soloNum } }] : []),
          ],
        };
      }

      const items = await prisma.vencimiento.findMany({
        where,
        include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true, tipoPersona: true, celular: true } } },
        // Ascendente: lo más próximo a vencer (y lo ya vencido) queda arriba.
        orderBy: { fecha: 'asc' },
        take: LIST_CAP,
      });
      return success(res, items);
    } catch (err) { next(err); }
  },

  async createVencimiento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { taxClientId, obligacion, periodo, fecha, monto, notas } = req.body;

      await getClientOfBusiness(taxClientId, businessId);
      if (!obligacion) throw new AppError('La obligación es requerida', 400);
      if (!OBLIGACIONES_VALIDAS.includes(obligacion)) throw new AppError('La obligación no es válida', 400);
      if (!periodo?.trim()) throw new AppError('El periodo es requerido', 400);
      if (!fecha) throw new AppError('La fecha es requerida', 400);

      try {
        const venc = await prisma.vencimiento.create({
          data: {
            taxClientId,
            obligacion,
            periodo: periodo.trim(),
            fecha: fechaValida(fecha),
            monto: montoValido(monto),
            notas: notas?.trim() || null,
          },
        });
        return created(res, venc, 'Vencimiento registrado');
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new AppError('Ese cliente ya tiene un vencimiento para esa obligación y periodo', 409);
        }
        throw e;
      }
    } catch (err) { next(err); }
  },

  /** Genera vencimientos en lote desde el calendario, para no registrarlos periodo
   *  por periodo. Sin `obligacion` → genera TODA la agenda del cliente según sus
   *  calidades (agenda completa). Con `obligacion` → genera todos los periodos de
   *  esa obligación. Idempotente: los que ya existen se saltan (no duplica). Las
   *  obligaciones sin calendario (ICA, exógena) se reportan aparte; PILA sí
   *  genera (12 vencimientos mensuales calculados). */
  async generarVencimientos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { taxClientId, obligacion, periodos: periodosSel } = req.body as { taxClientId?: string; obligacion?: Obligacion; periodos?: string[] };
      if (!taxClientId) throw new AppError('Falta el cliente', 400);
      const client = await getClientOfBusiness(taxClientId, businessId);

      const obligaciones: Obligacion[] = obligacion
        ? [obligacion]
        : obligacionesSugeridas(client.responsabilidades as Calidad[], []);

      // Filtro opcional: solo registrar los periodos elegidos por el contador (para
      // no traer los meses que ya pasaron). Si no viene la lista, se generan todos.
      const filtro = Array.isArray(periodosSel) && periodosSel.length > 0 ? new Set(periodosSel) : null;

      let creados = 0;
      let existentes = 0;
      const sinCalendario: Obligacion[] = [];

      for (const obl of obligaciones) {
        const variante = varianteDe(obl, client.tipoPersona, client.ivaPeriodicidad);
        const periodos = await periodosCalendario(obl, variante, client.nit);
        if (periodos.length === 0) { sinCalendario.push(obl); continue; }
        for (const p of periodos) {
          if (filtro && !filtro.has(p.periodo)) continue;
          try {
            await prisma.vencimiento.create({
              data: { taxClientId: client.id, obligacion: obl, periodo: p.periodo, fecha: p.fecha },
            });
            creados++;
          } catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') existentes++;
            else throw e;
          }
        }
      }

      const msg = creados > 0
        ? `Se generaron ${creados} vencimiento${creados === 1 ? '' : 's'}${existentes ? ` (${existentes} ya existían)` : ''}`
        : existentes > 0
          ? 'Todos los vencimientos ya estaban registrados'
          : 'Este cliente no tiene obligaciones de calendario para generar';
      return success(res, { creados, existentes, sinCalendario }, msg);
    } catch (err) { next(err); }
  },

  /** Regenera en LOTE la agenda tributaria (obligaciones derivadas de las
   *  calidades) del año en curso para TODOS los clientes activos. Idempotente
   *  (generarAgendaBatch usa skipDuplicates): no duplica lo ya generado. Pensado
   *  para el inicio de cada año — al sembrar el calendario nuevo y apuntar
   *  ANIO_CALENDARIO, un clic reactiva la agenda de todos los clientes. PILA y
   *  exógena no entran (tienen su propio flujo manual). */
  async regenerarAgendaTodos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const clientes = await prisma.taxClient.findMany({
        where: { businessId, activo: true },
        select: { id: true, nit: true, tipoPersona: true, ivaPeriodicidad: true, responsabilidades: true },
      });
      const creados = await generarAgendaBatch(
        clientes.map((c) => ({
          taxClientId: c.id,
          nit: c.nit,
          tipoPersona: c.tipoPersona,
          ivaPeriodicidad: c.ivaPeriodicidad,
          responsabilidades: c.responsabilidades as Calidad[],
        })),
      );
      const msg = creados > 0
        ? `Se generaron ${creados} vencimiento${creados === 1 ? '' : 's'} del año ${ANIO_CALENDARIO} para ${clientes.length} cliente${clientes.length === 1 ? '' : 's'}.`
        : `No había vencimientos nuevos por generar del año ${ANIO_CALENDARIO}; ya estaban registrados.`;
      return success(res, { creados, clientes: clientes.length, anio: ANIO_CALENDARIO }, msg);
    } catch (err) { next(err); }
  },

  async updateEstadoVencimiento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { estado } = req.body;
      // "vencida" ya NO es un estado que se fije a mano: es automático según la
      // fecha (lo calcula el frontend). El contador solo maneja estos.
      const ESTADOS = ['pendiente', 'en_proceso', 'presentada', 'pagada'];
      if (!ESTADOS.includes(estado)) throw new AppError('Estado inválido', 400);

      // Asegurar que el vencimiento sea de esta oficina antes de tocarlo.
      const venc = await prisma.vencimiento.findFirst({
        where: { id: req.params.id, taxClient: { businessId } },
      });
      if (!venc) throw new AppError('Vencimiento no encontrado', 404);

      const updated = await prisma.vencimiento.update({
        where: { id: req.params.id },
        data: { estado },
      });
      return success(res, updated, 'Estado actualizado');
    } catch (err) { next(err); }
  },

  async deleteVencimiento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const venc = await prisma.vencimiento.findFirst({
        where: { id: req.params.id, taxClient: { businessId } },
      });
      if (!venc) throw new AppError('Vencimiento no encontrado', 404);
      await prisma.vencimiento.delete({ where: { id: req.params.id } });
      return success(res, null, 'Vencimiento eliminado');
    } catch (err) { next(err); }
  },

  // ─── RESOLUCIONES DIAN ─────────────────────────────────────────────────────────
  async listResoluciones(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;

      // Auto-borrado: las resoluciones vencidas se borran 2 meses después de que
      // expiró su vigencia (ya no sirven). Purga perezosa al consultar; solo con
      // plan activo (en solo-lectura sus datos no se tocan).
      if (planActivo(req)) {
        const corte = new Date();
        corte.setMonth(corte.getMonth() - 2);
        await prisma.resolucionDian.deleteMany({
          where: { taxClient: { businessId }, fechaVigencia: { lt: corte } },
        });
      }

      const where: Prisma.ResolucionDianWhereInput = { taxClient: { businessId } };
      if (req.query.taxClientId) {
        await getClientOfBusiness(req.query.taxClientId as string, businessId);
        where.taxClientId = req.query.taxClientId as string;
      }
      const items = await prisma.resolucionDian.findMany({
        where,
        include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true } } },
        orderBy: { fechaVigencia: 'asc' },
        take: LIST_CAP,
      });
      return success(res, items);
    } catch (err) { next(err); }
  },

  async createResolucion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { taxClientId, tipo, clase, numero, fechaExpedicion, fechaVigencia, prefijo, rangoDesde, rangoHasta, modalidad, notas } = req.body;

      await getClientOfBusiness(taxClientId, businessId);
      const TIPOS = ['factura_electronica', 'pos_electronico', 'documento_soporte', 'otra'];
      if (!TIPOS.includes(tipo)) throw new AppError('Tipo de resolución inválido', 400);
      if (!numero?.trim()) throw new AppError('El número es requerido', 400);
      if (!fechaExpedicion || !fechaVigencia) throw new AppError('Las fechas son requeridas', 400);

      const reso = await prisma.resolucionDian.create({
        data: {
          taxClientId,
          tipo,
          clase: clase === 'autorizacion' || clase === 'habilitacion' ? clase : null,
          numero: numero.trim(),
          fechaExpedicion: fechaValida(fechaExpedicion, 'fecha de expedición'),
          fechaVigencia: fechaValida(fechaVigencia, 'fecha de vigencia'),
          prefijo: prefijo?.trim() || null,
          rangoDesde: enteroValido(rangoDesde, 'rango desde'),
          rangoHasta: enteroValido(rangoHasta, 'rango hasta'),
          modalidad: ['pos', 'electronica', 'contingencia'].includes(modalidad) ? modalidad : null,
          notas: notas?.trim() || null,
        },
      });
      return created(res, reso, 'Resolución registrada');
    } catch (err) { next(err); }
  },

  async deleteResolucion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const reso = await prisma.resolucionDian.findFirst({
        where: { id: req.params.id, taxClient: { businessId } },
      });
      if (!reso) throw new AppError('Resolución no encontrada', 404);
      await prisma.resolucionDian.delete({ where: { id: req.params.id } });
      return success(res, null, 'Resolución eliminada');
    } catch (err) { next(err); }
  },

  // ─── RESPONSABILIDADES MANUALES (exógena / otras) ───────────────────────────────
  // Mini-agendas para lo que NO está en el calendario DIAN. "exogena" se conserva;
  // "otra" se auto-limpia 2 meses después de la fecha (purga perezosa al listar).
  async listResponsabilidades(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const tipo = req.query.tipo as TipoRespManual;
      if (tipo !== 'exogena' && tipo !== 'otra') throw new AppError('Tipo inválido', 400);

      // Auto-borrado: un registro se borra 2 meses después de su fecha SI ya está
      // "presentado" (cumplido). Lo pendiente/vencido se conserva. Purga perezosa
      // (sin cron) al consultar; solo con plan activo (en solo-lectura no se tocan).
      if (planActivo(req)) {
        const corte = new Date();
        corte.setMonth(corte.getMonth() - 2);
        await prisma.responsabilidadManual.deleteMany({
          where: { tipo, estado: 'presentado', fecha: { lt: corte }, taxClient: { businessId } },
        });
      }

      const items = await prisma.responsabilidadManual.findMany({
        where: { tipo, taxClient: { businessId } },
        include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true } } },
        orderBy: { fecha: 'asc' },
        take: LIST_CAP,
      });
      return success(res, items);
    } catch (err) { next(err); }
  },

  async createResponsabilidad(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { taxClientId, tipo, concepto, fecha, estado } = req.body;
      await getClientOfBusiness(taxClientId, businessId);
      if (tipo !== 'exogena' && tipo !== 'otra') throw new AppError('Tipo inválido', 400);
      if (!concepto?.trim()) throw new AppError('El concepto es requerido', 400);
      if (!fecha) throw new AppError('La fecha es requerida', 400);
      const est: EstadoRespManual = estado === 'presentado' ? 'presentado' : 'pendiente';

      const item = await prisma.responsabilidadManual.create({
        data: {
          taxClientId,
          tipo,
          concepto: concepto.trim(),
          fecha: fechaValida(fecha),
          estado: est,
        },
      });
      return created(res, item, 'Registro creado');
    } catch (err) { next(err); }
  },

  async updateResponsabilidad(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const item = await prisma.responsabilidadManual.findFirst({
        where: { id: req.params.id, taxClient: { businessId } },
      });
      if (!item) throw new AppError('Registro no encontrado', 404);

      const { concepto, fecha, estado } = req.body;
      const data: Prisma.ResponsabilidadManualUpdateInput = {};
      if (concepto !== undefined) {
        if (!concepto?.trim()) throw new AppError('El concepto no puede estar vacío', 400);
        data.concepto = concepto.trim();
      }
      if (fecha !== undefined && fecha) data.fecha = fechaValida(fecha);
      if (estado !== undefined) {
        if (estado !== 'pendiente' && estado !== 'presentado') throw new AppError('Estado inválido', 400);
        data.estado = estado;
      }

      const updated = await prisma.responsabilidadManual.update({ where: { id: item.id }, data });
      return success(res, updated, 'Registro actualizado');
    } catch (err) { next(err); }
  },

  async deleteResponsabilidad(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const item = await prisma.responsabilidadManual.findFirst({
        where: { id: req.params.id, taxClient: { businessId } },
      });
      if (!item) throw new AppError('Registro no encontrado', 404);
      await prisma.responsabilidadManual.delete({ where: { id: item.id } });
      return success(res, null, 'Registro eliminado');
    } catch (err) { next(err); }
  },

  /** Vencimientos prioritarios para los avisos al abrir la agenda: pendientes
   *  (no presentada/pagada) que ya vencieron o vencen dentro de 7 días. */
  async prioritarios(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const items = await prisma.vencimiento.findMany({
        where: {
          taxClient: { businessId },
          estado: { notIn: ['presentada', 'pagada'] },
          fecha: { lte: diasDesdeHoy(7) },
        },
        include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true } } },
        orderBy: { fecha: 'asc' },
        take: 100,
      });
      return success(res, items);
    } catch (err) { next(err); }
  },

  // ─── PANEL ─────────────────────────────────────────────────────────────────────
  async panel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      // requireContable ya cargó planExpiresAt en el request.
      const planExpiresAt = (req as AuthRequest & { planExpiresAt?: Date | null }).planExpiresAt ?? null;
      const activa = planExpiresAt != null && new Date(planExpiresAt) > new Date();
      const diasRestantes = planExpiresAt
        ? Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000))
        : 0;

      const [proximosVencimientos, resolucionesPorVencer, totalClientes] = await Promise.all([
        prisma.vencimiento.findMany({
          where: {
            taxClient: { businessId },
            estado: { notIn: ['presentada', 'pagada'] },
            fecha: { lte: diasDesdeHoy(15) },
          },
          include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true } } },
          orderBy: { fecha: 'asc' },
          take: 50,
        }),
        prisma.resolucionDian.findMany({
          where: {
            taxClient: { businessId },
            estado: { not: 'vencida' },
            fechaVigencia: { lte: diasDesdeHoy(30) },
          },
          include: { taxClient: { select: { id: true, razonSocial: true } } },
          orderBy: { fechaVigencia: 'asc' },
          take: 50,
        }),
        prisma.taxClient.count({ where: { businessId, activo: true } }),
      ]);
      return success(res, {
        proximosVencimientos,
        resolucionesPorVencer,
        totalClientes,
        suscripcion: { activa, diasRestantes, planExpiresAt },
      });
    } catch (err) { next(err); }
  },

  // ─── BÓVEDA DE CREDENCIALES ────────────────────────────────────────────────
  async listCredenciales(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const search = getSearch(req);
      const where: Prisma.ClientCredentialWhereInput = { deletedAt: null, taxClient: { businessId } };
      if (search) {
        // Solo agregar el filtro por NIT si hay dígitos: `contains: ''` matchea todo.
        const num = soloDigitos(search);
        where.OR = [
          { entidad: { contains: search, mode: 'insensitive' } },
          { usuario1: { contains: search, mode: 'insensitive' } },
          { taxClient: { razonSocial: { contains: search, mode: 'insensitive' } } },
          ...(num ? [{ taxClient: { nit: { contains: num } } }] : []),
        ];
      }
      const rows = await prisma.clientCredential.findMany({
        where,
        include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true } } },
        orderBy: { createdAt: 'desc' },
        take: LIST_CAP,
      });
      // La clave se descifra para que el contador la vea/copie (es su bóveda).
      const data = rows.map((r) => ({
        id: r.id, entidad: r.entidad, usuario1: r.usuario1, usuario2: r.usuario2,
        clave: decrypt(r.claveEnc), link: r.link, taxClient: r.taxClient,
      }));
      return success(res, data);
    } catch (err) { next(err); }
  },

  async createCredencial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { taxClientId, entidad, usuario1, usuario2, clave, link } = req.body;
      await getClientOfBusiness(taxClientId, businessId); // valida pertenencia
      if (!entidad?.trim()) throw new AppError('La entidad es requerida', 400);
      if (!usuario1?.trim()) throw new AppError('El usuario es requerido', 400);
      if (!clave) throw new AppError('La contraseña es requerida', 400);
      const cred = await prisma.clientCredential.create({
        data: {
          taxClientId,
          entidad: entidad.trim(),
          usuario1: usuario1.trim(),
          usuario2: usuario2?.trim() || null,
          claveEnc: encrypt(String(clave)),
          link: link?.trim() || null,
        },
      });
      return created(res, { id: cred.id }, 'Credencial guardada');
    } catch (err) { next(err); }
  },

  async updateCredencial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const existing = await prisma.clientCredential.findFirst({
        where: { id: req.params.id, deletedAt: null, taxClient: { businessId } },
      });
      if (!existing) throw new AppError('Credencial no encontrada', 404);

      const { entidad, usuario1, usuario2, clave, link } = req.body;
      const data: Prisma.ClientCredentialUpdateInput = {};
      if (entidad !== undefined) {
        if (!entidad?.trim()) throw new AppError('La entidad es requerida', 400);
        data.entidad = entidad.trim();
      }
      if (usuario1 !== undefined) {
        if (!usuario1?.trim()) throw new AppError('El usuario es requerido', 400);
        data.usuario1 = usuario1.trim();
      }
      if (usuario2 !== undefined) data.usuario2 = usuario2?.trim() || null;
      if (link !== undefined) data.link = link?.trim() || null;
      // Solo se recifra la clave si mandan una nueva no vacía (editar otros campos
      // sin re-escribir la contraseña conserva la actual).
      if (clave !== undefined && clave !== '') data.claveEnc = encrypt(String(clave));

      await prisma.clientCredential.update({ where: { id: existing.id }, data });
      return success(res, null, 'Credencial actualizada');
    } catch (err) { next(err); }
  },

  async deleteCredencial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const existing = await prisma.clientCredential.findFirst({
        where: { id: req.params.id, deletedAt: null, taxClient: { businessId } },
      });
      if (!existing) throw new AppError('Credencial no encontrada', 404);
      await prisma.clientCredential.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
      return success(res, null, 'Credencial eliminada');
    } catch (err) { next(err); }
  },

  // ─── BÓVEDA DE DOCUMENTOS ──────────────────────────────────────────────────
  async listDocumentos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      await getClientOfBusiness(req.params.id, businessId);
      const docs = await prisma.clientDocument.findMany({
        where: { taxClientId: req.params.id },
        orderBy: { createdAt: 'desc' },
      });
      return success(res, docs);
    } catch (err) { next(err); }
  },

  async uploadDocumento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      await getClientOfBusiness(req.params.id, businessId);

      const file = (req as unknown as { file?: Express.Multer.File }).file;
      if (!file) throw new AppError('No se envió ningún archivo', 400);

      const { nombre, categoria } = req.body as { nombre?: string; categoria?: string };
      const url = await uploadDocument(file.buffer).catch(() => {
        throw new AppError('No se pudo subir el documento. Verifica tu conexión e intenta de nuevo.', 502);
      });

      const doc = await prisma.clientDocument.create({
        data: {
          taxClientId: req.params.id,
          nombre: (nombre?.trim() || file.originalname || 'Documento').slice(0, 120),
          categoria: categoria?.trim() || null,
          url,
          mimeType: file.mimetype,
          size: file.size,
        },
      });
      return created(res, doc, 'Documento subido');
    } catch (err) { next(err); }
  },

  async deleteDocumento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const doc = await prisma.clientDocument.findFirst({
        where: { id: req.params.id, taxClient: { businessId } },
      });
      if (!doc) throw new AppError('Documento no encontrado', 404);
      await prisma.clientDocument.delete({ where: { id: doc.id } });
      // Limpieza del archivo en Cloudinary (best-effort).
      deleteImage(doc.url).catch(() => {});
      return success(res, null, 'Documento eliminado');
    } catch (err) { next(err); }
  },
};
