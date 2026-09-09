import { Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AuthRequest } from '../middlewares/auth';
import { success, AppError } from '../utils/response';
import { normalizarIdentificacion } from '../utils/nit';
import { findDataSheet, findHeaderRow, mapColumns, cellVal, normalizeHeader } from '../utils/excelParser';

// Importar los fiados que el negocio ya tiene apuntados en un cuaderno o en su
// propio Excel, en vez de teclearlos uno por uno al empezar con Ventrix.
//
// Es el espejo de la importación de cuentas por pagar (supplierCredit.routes.ts):
// allá se debe a proveedores, aquí los clientes le deben al negocio.

/** Encabezados que puede traer el archivo. Se aceptan sinónimos porque cada
 *  quien nombra sus columnas distinto y nadie las va a renombrar a mano. */
const CREDITO_COL_DEFS: Record<string, string[]> = {
  cliente:        ['cliente', 'nombre', 'nombre cliente', 'customer', 'deudor',
                   'razon social', 'razon', 'tercero'],
  // La identificación es la que evita cruzar dos clientes que se llaman parecido.
  // Ojo: aquí NO va "documento" a secas — ese alias ya es de la factura.
  identificacion: ['identificacion', 'identificación', 'cedula', 'cédula', 'cc', 'nit',
                   'documento identidad', 'num identificacion', 'numero identificacion',
                   'nit cliente', 'cedula cliente', 'tax id'],
  telefono:       ['telefono', 'teléfono', 'celular', 'movil', 'móvil', 'whatsapp',
                   'contacto', 'phone'],
  factura:        ['factura', 'invoice', 'numero factura', 'num factura', 'no factura',
                   'n factura', 'documento', 'referencia', 'remision', 'consecutivo'],
  total:          ['valor total', 'total', 'valor', 'monto', 'importe', 'deuda',
                   'valor factura', 'total factura', 'amount', 'fiado'],
  abonado:        ['abonado', 'abono', 'pagado', 'valor pagado', 'anticipo', 'paid'],
  vence:          ['vence', 'vencimiento', 'fecha vencimiento', 'fecha de vencimiento',
                   'fecha pago', 'fecha de pago', 'plazo', 'due date', 'fecha limite'],
  notas:          ['notas', 'nota', 'observaciones', 'observacion', 'comentarios', 'detalle'],
};

const CREDITO_FIELD_LABELS: Record<string, string> = {
  cliente: 'Cliente', identificacion: 'Identificación', telefono: 'Teléfono',
  factura: 'Factura', total: 'Valor total', abonado: 'Abonado',
  vence: 'Vence', notas: 'Notas',
};

/** Lee un monto en formato colombiano ("1.500.000" o "1500000,50"). */
function leerMontoLocal(v: string): number {
  const limpio = String(v || '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(limpio);
  return isNaN(n) ? NaN : Math.round(n);
}

/** Fecha desde texto. Acepta AAAA-MM-DD y dd/mm/aaaa, que es como la escribe
 *  la gente aquí. Devuelve null si no se entiende. */
function leerFechaLocal(v: string): Date | null {
  const t = String(v || '').trim();
  if (!t) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));
  const latam = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(t);
  if (latam) return new Date(Date.UTC(+latam[3], +latam[2] - 1, +latam[1]));
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

export const creditImportController = {
  /** Plantilla de Excel para que el negocio llene sus fiados. */
  async template(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Fiados');

      ws.columns = [
        { header: 'Cliente', key: 'cliente', width: 30 },
        // La identificación va de segunda a propósito: es la que separa a dos
        // clientes que se llaman igual.
        { header: 'Identificación', key: 'identificacion', width: 18 },
        { header: 'Teléfono', key: 'telefono', width: 16 },
        { header: 'Factura', key: 'factura', width: 18 },
        { header: 'Valor total', key: 'total', width: 16 },
        { header: 'Abonado', key: 'abonado', width: 14 },
        { header: 'Vence', key: 'vence', width: 14 },
        { header: 'Notas', key: 'notas', width: 30 },
      ];

      ws.getRow(1).eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
        cell.alignment = { horizontal: 'center' };
      });

      // Ejemplos: uno sin abonos, uno con abono parcial y uno sin plazo.
      ws.addRow({ cliente: 'María Gómez', identificacion: '1085248963', telefono: '3001234567', factura: 'FAC-1024', total: 150000, abonado: 0, vence: '2026-10-15', notas: 'Mercado de octubre' });
      ws.addRow({ cliente: 'Pedro Ramírez', identificacion: '98765432', telefono: '3109876543', factura: 'FAC-877', total: 80000, abonado: 30000, vence: '2026-09-30', notas: '' });
      // Sin identificación también se puede: se empareja por nombre.
      ws.addRow({ cliente: 'Tienda La Esquina', identificacion: '', telefono: '', factura: '', total: 250000, abonado: 0, vence: '', notas: 'Sin plazo acordado' });

      const buffer = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=plantilla-fiados.xlsx');
      res.send(buffer);
    } catch (err) { next(err); }
  },

  /** Carga el archivo. Con ?dryRun=true solo devuelve la vista previa. */
  async importar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw new AppError('Archivo requerido', 400);
      const dryRun = req.query.dryRun === 'true';
      const businessId = req.user!.businessId!;

      const wb = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wb.xlsx.load as any)(req.file.buffer);
      const ws = findDataSheet(wb);

      const allAliases = Object.values(CREDITO_COL_DEFS).flat();
      const headerRowNum = findHeaderRow(ws, allAliases);
      const headers: string[] = [];
      ws.getRow(headerRowNum).eachCell((cell) => {
        headers.push(normalizeHeader(String(cell.value ?? '')));
      });
      const { col, detectedColumns } = mapColumns(headers, CREDITO_COL_DEFS);

      if (col.cliente === -1) {
        throw new AppError('No se encontró la columna del cliente. Asegúrate de tener una columna "Cliente".', 400);
      }
      if (col.total === -1) {
        throw new AppError('No se encontró la columna del valor. Asegúrate de tener una columna "Valor total".', 400);
      }

      const detectedColumnsLabeled = detectedColumns.map((d) => ({
        field: d.field,
        header: `${d.header} → ${CREDITO_FIELD_LABELS[d.field] ?? d.field}`,
      }));

      interface Fila {
        rowNum: number; cliente: string; identificacion: string | null;
        telefono: string | null; factura: string | null;
        total: number; abonado: number; vence: Date | null; notas: string | null;
      }
      type Aviso = { row: number; name: string; message: string; type: 'error' | 'warning' };

      const issues: Aviso[] = [];
      const validRows: Fila[] = [];
      let totalRows = 0;

      // Tope de filas: un archivo gigante generaría miles de consultas y tumbaría
      // la petición. Las de más se avisan y se ignoran.
      const MAX_FILAS = 2000;
      const ultimaFila = Math.min(ws.rowCount, headerRowNum + MAX_FILAS);

      for (let rowNum = headerRowNum + 1; rowNum <= ultimaFila; rowNum++) {
        const row = ws.getRow(rowNum);
        const cliente = cellVal(row, col.cliente);
        if (!cliente) continue;
        totalRows++;

        const total = leerMontoLocal(cellVal(row, col.total));
        if (!total || isNaN(total) || total <= 0) {
          issues.push({ row: rowNum, name: cliente, message: 'Sin valor válido — no se puede importar', type: 'error' });
          continue;
        }

        const abonado = col.abonado !== -1 ? (leerMontoLocal(cellVal(row, col.abonado)) || 0) : 0;
        if (abonado > total) {
          issues.push({ row: rowNum, name: cliente, message: 'Lo abonado supera el valor total — se importa sin abono', type: 'warning' });
        }
        const abonadoOk = abonado > 0 && abonado <= total ? abonado : 0;

        const vence = col.vence !== -1 ? leerFechaLocal(cellVal(row, col.vence)) : null;
        if (col.vence !== -1 && cellVal(row, col.vence) && !vence) {
          issues.push({ row: rowNum, name: cliente, message: 'Fecha de pago no reconocida — queda sin plazo', type: 'warning' });
        }

        validRows.push({
          rowNum, cliente,
          identificacion: col.identificacion !== -1 ? (cellVal(row, col.identificacion) || null) : null,
          telefono: col.telefono !== -1 ? (cellVal(row, col.telefono) || null) : null,
          factura: col.factura !== -1 ? (cellVal(row, col.factura) || null) : null,
          total, abonado: abonadoOk, vence,
          notas: col.notas !== -1 ? (cellVal(row, col.notas) || null) : null,
        });
      }

      if (ws.rowCount > ultimaFila) {
        issues.unshift({
          row: ultimaFila, name: '',
          message: `El archivo supera las ${MAX_FILAS} filas; solo se procesaron las primeras ${MAX_FILAS}.`,
          type: 'warning',
        });
      }

      // Para emparejar con lo que ya existe manda la IDENTIFICACIÓN, no el nombre:
      // dos clientes se pueden llamar igual y por nombre se cruzaban las deudas de
      // uno con las del otro. El nombre queda de respaldo para las filas sin
      // cédula. Lo que no exista se crea.
      const nombres = Array.from(new Set(validRows.map((r) => r.cliente)));
      const identificaciones = Array.from(new Set(
        validRows.map((r) => normalizarIdentificacion(r.identificacion || '')).filter(Boolean),
      ));

      const existentes = (nombres.length > 0 || identificaciones.length > 0)
        ? await prisma.customer.findMany({
            where: {
              businessId, deletedAt: null,
              OR: [
                { name: { in: nombres, mode: 'insensitive' } },
                ...(identificaciones.length ? [{ document: { not: null } }] : []),
              ],
            },
            select: { id: true, name: true, document: true },
          })
        : [];

      const porNombre = new Map(existentes.map((c) => [c.name.toLowerCase(), c.id]));
      const porId = new Map<string, string>();
      for (const c of existentes) {
        const clave = normalizarIdentificacion(c.document || '');
        if (clave) porId.set(clave, c.id);
      }

      if (dryRun) {
        return success(res, {
          total: totalRows,
          valid: validRows.length,
          toCreate: validRows.length,
          clientesNuevos: Array.from(new Set(validRows.map((r) => {
            const id = normalizarIdentificacion(r.identificacion || '');
            return id || r.cliente.toLowerCase();
          }))).filter((clave) => !porId.has(clave) && !porNombre.has(clave)).length,
          issues,
          detectedColumns: detectedColumnsLabeled,
        }, 'Vista previa generada');
      }

      const results = {
        imported: 0,
        clientesCreados: 0,
        errors: issues
          .filter((i) => i.type === 'error')
          .map((i) => ({ row: i.row, message: `"${i.name}": ${i.message}` })),
      };

      for (const r of validRows) {
        try {
          const idNorm = normalizarIdentificacion(r.identificacion || '');
          // Primero por identificación; solo si la fila no la trae se cae al nombre.
          let customerId = idNorm ? porId.get(idNorm) : undefined;
          if (!customerId && !idNorm) customerId = porNombre.get(r.cliente.toLowerCase());

          if (!customerId) {
            const nuevo = await prisma.customer.create({
              data: {
                businessId, name: r.cliente,
                document: r.identificacion?.trim() || null,
                phone: r.telefono?.trim() || null,
              },
              select: { id: true },
            });
            customerId = nuevo.id;
            porNombre.set(r.cliente.toLowerCase(), customerId);
            if (idNorm) porId.set(idNorm, customerId);
            results.clientesCreados++;
          } else if (idNorm && !porId.has(idNorm)) {
            // El cliente ya estaba (por nombre) pero sin cédula: se le completa
            // con la del archivo, así la próxima importación empareja por ella.
            await prisma.customer.update({
              where: { id: customerId },
              data: { document: r.identificacion?.trim() || null },
            }).catch(() => { /* si otro proceso lo puso primero, da igual */ });
            porId.set(idNorm, customerId);
          }

          const balance = r.total - r.abonado;
          // El fiado y la deuda del cliente se escriben juntos: si se cae a la
          // mitad, el negocio vería un saldo que no cuadra con sus fiados.
          await prisma.$transaction(async (tx) => {
            await tx.credit.create({
              data: {
                customerId: customerId!,
                totalAmount: r.total,
                paidAmount: r.abonado,
                balance,
                status: balance <= 0 ? 'PAID' : r.abonado > 0 ? 'PARTIAL' : 'PENDING',
                dueDate: r.vence,
                // La factura va en su propia columna: metida en las notas no se
                // veía en el listado ni se podía buscar.
                invoiceNumber: r.factura || null,
                notes: r.notas || null,
              },
            });
            // Lo que queda debiendo, no el total: si la fila ya trae abonos, esa
            // plata ya entró y no se le puede volver a cobrar.
            if (balance > 0) {
              await tx.customer.update({
                where: { id: customerId! },
                data: { currentDebt: { increment: balance } },
              });
            }
          });
          results.imported++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido';
          results.errors.push({ row: r.rowNum, message: `"${r.cliente}": ${msg}` });
        }
      }

      await cache.del(`dashboard:${businessId}`).catch(() => {});
      return success(res, results, `Importación: ${results.imported} fiados creados${results.clientesCreados ? `, ${results.clientesCreados} clientes nuevos` : ''}`);
    } catch (err) { next(err); }
  },
};
