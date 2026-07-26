import { Response, NextFunction } from 'express';
import { Prisma, Calidad, Obligacion, TipoRespManual, EstadoRespManual } from '@prisma/client';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { success, created, paginated, AppError } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { calcularDV, soloDigitos, ultimoDigito, dosUltimosDigitos } from '../utils/nit';
import { normalizarResponsabilidades, obligacionesSugeridas } from '../utils/calidades';
import ExcelJS from 'exceljs';
import { findDataSheet, findHeaderRow, mapColumns, cellVal, normalizeHeader } from '../utils/excelParser';
import {
  TAX_CLIENT_COL_DEFS, TAX_CLIENT_FIELD_LABELS,
  parseTipoPersona, parseCalidades, parseIvaPeriodicidad,
} from '../utils/contableImport';

// El calendario sembrado hoy es solo 2026 (cada año se siembra el decreto nuevo).
const ANIO_CALENDARIO = 2026;

/** Confirma que un TaxClient existe y pertenece a ESTA oficina. Devuelve el
 *  cliente o lanza 404 — nunca revela la existencia de clientes de otra oficina. */
async function getClientOfBusiness(taxClientId: string, businessId: string) {
  const client = await prisma.taxClient.findFirst({
    where: { id: taxClientId, businessId },
  });
  if (!client) throw new AppError('Cliente no encontrado', 404);
  return client;
}

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
      await getClientOfBusiness(req.params.id, businessId);

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

      try {
        const client = await prisma.taxClient.update({
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

      for (let rowNum = headerRowNum + 1; rowNum <= ws.rowCount; rowNum++) {
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
        errors: issues
          .filter((i) => i.type === 'error')
          .map((i) => ({ row: i.row, message: `"${i.name}": ${i.message}` })),
      };

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
          if (existing) {
            await prisma.taxClient.update({ where: { id: existing.id }, data: { ...data, activo: true } });
            results.updated++;
          } else {
            await prisma.taxClient.create({ data: { ...data, businessId } });
            results.imported++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido';
          results.errors.push({ row: r.rowNum, message: `"${r.razonSocial}": ${msg}` });
        }
      }

      return success(res, results, `Importación: ${results.imported} creados, ${results.updated} actualizados`);
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
      // periodos = [] cuando la obligación no está en el calendario (ICA, PILA,
      // exógena) → el frontend deja la fecha en modo manual.
      return success(res, periodos);
    } catch (err) { next(err); }
  },

  // ─── VENCIMIENTOS ──────────────────────────────────────────────────────────────
  async listVencimientos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const obligacion = req.query.obligacion as Obligacion | undefined;
      const search = (req.query.search as string)?.trim();

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
        include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true } } },
        // Ascendente: lo más próximo a vencer (y lo ya vencido) queda arriba.
        orderBy: { fecha: 'asc' },
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
      if (!periodo?.trim()) throw new AppError('El periodo es requerido', 400);
      if (!fecha) throw new AppError('La fecha es requerida', 400);

      try {
        const venc = await prisma.vencimiento.create({
          data: {
            taxClientId,
            obligacion,
            periodo: periodo.trim(),
            fecha: new Date(`${fecha}T00:00:00Z`),
            monto: monto != null && monto !== '' ? new Prisma.Decimal(monto) : null,
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
   *  obligaciones sin calendario (ICA, PILA, exógena) se reportan aparte. */
  async generarVencimientos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { taxClientId, obligacion } = req.body as { taxClientId?: string; obligacion?: Obligacion };
      if (!taxClientId) throw new AppError('Falta el cliente', 400);
      const client = await getClientOfBusiness(taxClientId, businessId);

      const obligaciones: Obligacion[] = obligacion
        ? [obligacion]
        : obligacionesSugeridas(client.responsabilidades as Calidad[], []);

      let creados = 0;
      let existentes = 0;
      const sinCalendario: Obligacion[] = [];

      for (const obl of obligaciones) {
        const variante = varianteDe(obl, client.tipoPersona, client.ivaPeriodicidad);
        const periodos = await periodosCalendario(obl, variante, client.nit);
        if (periodos.length === 0) { sinCalendario.push(obl); continue; }
        for (const p of periodos) {
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
      const where: Prisma.ResolucionDianWhereInput = { taxClient: { businessId } };
      if (req.query.taxClientId) {
        await getClientOfBusiness(req.query.taxClientId as string, businessId);
        where.taxClientId = req.query.taxClientId as string;
      }
      const items = await prisma.resolucionDian.findMany({
        where,
        include: { taxClient: { select: { id: true, razonSocial: true } } },
        orderBy: { fechaVigencia: 'asc' },
      });
      return success(res, items);
    } catch (err) { next(err); }
  },

  async createResolucion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const { taxClientId, tipo, clase, numero, fechaExpedicion, fechaVigencia, prefijo, rangoDesde, rangoHasta, modalidad, notas } = req.body;

      await getClientOfBusiness(taxClientId, businessId);
      const TIPOS = ['factura_electronica', 'documento_soporte', 'otra'];
      if (!TIPOS.includes(tipo)) throw new AppError('Tipo de resolución inválido', 400);
      if (!numero?.trim()) throw new AppError('El número es requerido', 400);
      if (!fechaExpedicion || !fechaVigencia) throw new AppError('Las fechas son requeridas', 400);

      const reso = await prisma.resolucionDian.create({
        data: {
          taxClientId,
          tipo,
          clase: clase === 'autorizacion' || clase === 'habilitacion' ? clase : null,
          numero: numero.trim(),
          fechaExpedicion: new Date(`${fechaExpedicion}T00:00:00Z`),
          fechaVigencia: new Date(`${fechaVigencia}T00:00:00Z`),
          prefijo: prefijo?.trim() || null,
          rangoDesde: rangoDesde != null && rangoDesde !== '' ? Number(rangoDesde) : null,
          rangoHasta: rangoHasta != null && rangoHasta !== '' ? Number(rangoHasta) : null,
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

      // "Otras responsabilidades": se borran solas 2 meses después de la fecha de
      // vencimiento, para no saturar. Purga perezosa (sin cron) al consultar.
      if (tipo === 'otra') {
        const corte = new Date();
        corte.setMonth(corte.getMonth() - 2);
        await prisma.responsabilidadManual.deleteMany({
          where: { tipo: 'otra', fecha: { lt: corte }, taxClient: { businessId } },
        });
      }

      const items = await prisma.responsabilidadManual.findMany({
        where: { tipo, taxClient: { businessId } },
        include: { taxClient: { select: { id: true, razonSocial: true, nit: true, dv: true } } },
        orderBy: { fecha: 'asc' },
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
          fecha: new Date(`${fecha}T00:00:00Z`),
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
      if (fecha !== undefined && fecha) data.fecha = new Date(`${fecha}T00:00:00Z`);
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
};
