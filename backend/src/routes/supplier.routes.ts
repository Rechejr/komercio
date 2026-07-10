import { Router } from 'express';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { supplierController } from '../controllers/supplier.controller';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { planLimit } from '../middlewares/planLimit';
import { prisma } from '../config/database';
import { success, AppError } from '../utils/response';
import {
  findDataSheet, findHeaderRow, mapColumns, cellVal,
  normalizePhone, normalizeDocument, isValidEmail, normalizeHeader,
} from '../utils/excelParser';

const router = Router();

// ── Template download (no auth — blank file, no user data) ───────────────────
router.get('/import-template', async (_req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Proveedores');

    ws.columns = [
      { header: 'Nombre comercial',  key: 'name',        width: 28 },
      { header: 'Razón social',      key: 'legalName',   width: 28 },
      { header: 'NIT / Documento',   key: 'document',    width: 18 },
      { header: 'Persona de contacto', key: 'contactName', width: 22 },
      { header: 'Teléfono',          key: 'phone',        width: 14 },
      { header: 'Celular',           key: 'mobile',       width: 14 },
      { header: 'Email',             key: 'email',        width: 28 },
      { header: 'Dirección',         key: 'address',      width: 28 },
      { header: 'Ciudad',            key: 'city',         width: 15 },
      { header: 'Notas',             key: 'notes',        width: 28 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center' };
    });

    ws.addRow({ name: 'Distribuidora Andina', legalName: 'Distribuidora Andina S.A.S', document: '900123456-1', contactName: 'Carlos Martínez', phone: '6017891234', mobile: '3109876543', email: 'distribuidora@email.com', address: 'Carrera 15 #72-50', city: 'Bogotá', notes: '' });
    ws.addRow({ name: 'Almacén El Sol', legalName: '', document: '12345678', contactName: 'Ana López', phone: '', mobile: '3051234567', email: '', address: 'Av. Las Américas #45-20', city: 'Cali', notes: 'Proveedor de alimentos' });
    ws.addRow({ name: 'Comercializadora Norte', legalName: 'Comercializadora del Norte Ltda', document: '800456789-5', contactName: 'Luis Gómez', phone: '5751234567', mobile: '3155559876', email: 'norte@proveedores.com', address: 'Calle 45 #20-30', city: 'Barranquilla', notes: '' });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla-proveedores.xlsx');
    res.send(buffer);
  } catch (err) { next(err); }
});

router.use(authenticate);

const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError('Solo se permiten archivos Excel (.xlsx, .xls) o CSV', 400));
    }
    cb(null, true);
  },
});

const SUPPLIER_COL_DEFS: Record<string, string[]> = {
  name:        ['nombre', 'nombre comercial', 'name', 'proveedor', 'comercial',
                 'empresa', 'supplier', 'compania', 'negocio'],
  legalName:   ['razon social', 'razon', 'legalname', 'denominacion social',
                 'nombre juridico', 'nombre legal', 'sociedad', 'legal name',
                 'razon social o nombre'],
  document:    ['nit', 'documento', 'document', 'cc', 'identificacion', 'rut',
                 'num documento', 'numero documento', 'ruc', 'id fiscal', 'id'],
  contactName: ['contacto', 'contact', 'persona de contacto', 'representante',
                 'encargado', 'responsable', 'asesor', 'vendedor', 'persona'],
  phone:       ['telefono', 'phone', 'tel', 'fijo', 'telefono fijo', 'landline',
                 'tel fijo', 'num telefono'],
  mobile:      ['celular', 'mobile', 'cel', 'movil', 'whatsapp', 'cel proveedor',
                 'telefono movil', 'num celular'],
  email:       ['email', 'correo', 'mail', 'e-mail', 'correo electronico'],
  address:     ['direccion', 'address', 'dir', 'domicilio', 'ubicacion', 'calle'],
  city:        ['ciudad', 'city', 'municipio', 'localidad', 'poblacion'],
  notes:       ['notas', 'notes', 'observaciones', 'observacion', 'comentarios',
                 'nota', 'detalle', 'descripcion'],
};

const SUPPLIER_FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', legalName: 'Razón social', document: 'NIT/Doc',
  contactName: 'Contacto', phone: 'Teléfono', mobile: 'Celular',
  email: 'Correo', address: 'Dirección', city: 'Ciudad', notes: 'Notas',
};

// ── Bulk import (supports ?dryRun=true for preview) ──────────────────────────
router.post('/import',
  authorize('ADMIN', 'SUPERVISOR'),
  planLimit.bulkImport(),
  xlsxUpload.single('file'),
  async (req: AuthRequest, res, next) => {
    try {
      if (!req.file) throw new AppError('Archivo requerido', 400);
      const dryRun = req.query.dryRun === 'true';
      const businessId = req.user!.businessId!;

      const wb = new ExcelJS.Workbook();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (wb.xlsx.load as any)(req.file.buffer);
      const ws = findDataSheet(wb);

      const allAliases = Object.values(SUPPLIER_COL_DEFS).flat();
      const headerRowNum = findHeaderRow(ws, allAliases);

      const headers: string[] = [];
      ws.getRow(headerRowNum).eachCell((cell) => {
        headers.push(normalizeHeader(String(cell.value ?? '')));
      });

      const { col, detectedColumns } = mapColumns(headers, SUPPLIER_COL_DEFS);

      if (col.name === -1) {
        throw new AppError(
          'No se encontró columna de nombre. Asegúrate de tener una columna "Nombre" o "Proveedor".',
          400,
        );
      }

      const detectedColumnsLabeled = detectedColumns.map((d) => ({
        field: d.field,
        header: `${d.header} → ${SUPPLIER_FIELD_LABELS[d.field] ?? d.field}`,
      }));

      interface ParsedRow {
        rowNum: number;
        name: string;
        legalName: string | null;
        document: string | null;
        contactName: string | null;
        phone: string | null;
        mobile: string | null;
        email: string | null;
        address: string | null;
        city: string | null;
        notes: string | null;
      }
      type RowIssue = { row: number; name: string; message: string; type: 'error' | 'warning' };

      const issues: RowIssue[] = [];
      const validRows: ParsedRow[] = [];
      const seenDocuments = new Map<string, number>();
      let totalRows = 0;

      for (let rowNum = headerRowNum + 1; rowNum <= ws.rowCount; rowNum++) {
        const row = ws.getRow(rowNum);
        const name = cellVal(row, col.name);
        if (!name) continue;
        totalRows++;

        const rawDoc = cellVal(row, col.document);
        const doc = rawDoc ? normalizeDocument(rawDoc) : null;

        if (doc) {
          if (seenDocuments.has(doc)) {
            issues.push({
              row: rowNum, name,
              message: `Documento "${doc}" ya aparece en la fila ${seenDocuments.get(doc)}`,
              type: 'warning',
            });
          } else {
            seenDocuments.set(doc, rowNum);
          }
        }

        const rawEmail = cellVal(row, col.email);
        const email = rawEmail || null;
        if (email && !isValidEmail(email)) {
          issues.push({ row: rowNum, name, message: `Email "${email}" no es válido`, type: 'warning' });
        }

        const rawPhone = cellVal(row, col.phone);
        const rawMobile = cellVal(row, col.mobile);

        validRows.push({
          rowNum, name,
          legalName: cellVal(row, col.legalName) || null,
          document: doc,
          contactName: cellVal(row, col.contactName) || null,
          phone: rawPhone ? normalizePhone(rawPhone) : null,
          mobile: rawMobile ? normalizePhone(rawMobile) : null,
          email: email && isValidEmail(email) ? email.toLowerCase().trim() : null,
          address: cellVal(row, col.address) || null,
          city: cellVal(row, col.city) || null,
          notes: cellVal(row, col.notes) || null,
        });
      }

      if (dryRun) {
        const docsInFile = validRows.map((r) => r.document).filter((d): d is string => !!d);
        const existingDocs = new Set<string>();
        if (docsInFile.length > 0) {
          const existing = await prisma.supplier.findMany({
            where: { businessId, document: { in: docsInFile } },
            select: { document: true },
          });
          existing.forEach((s) => { if (s.document) existingDocs.add(s.document); });
        }

        return success(res, {
          total: totalRows,
          valid: validRows.length,
          toCreate: validRows.filter((r) => !r.document || !existingDocs.has(r.document)).length,
          toUpdate: validRows.filter((r) => r.document && existingDocs.has(r.document)).length,
          issues,
          detectedColumns: detectedColumnsLabeled,
        }, 'Vista previa generada');
      }

      // ── Actual import ────────────────────────────────────────────────────────
      const results = {
        imported: 0,
        updated: 0,
        errors: issues
          .filter((i) => i.type === 'error')
          .map((i) => ({ row: i.row, message: `"${i.name}": ${i.message}` })),
      };

      // Batch-fetch existing suppliers by document to avoid N+1
      const allDocs = validRows.map((r) => r.document).filter((d): d is string => !!d);
      const existingSuppliers = allDocs.length > 0
        ? await prisma.supplier.findMany({
            where: { businessId, document: { in: allDocs } },
            select: { id: true, document: true },
          })
        : [];
      const existingByDoc = new Map(existingSuppliers.map((s) => [s.document!, s]));

      for (const r of validRows) {
        try {
          const data = {
            name: r.name,
            ...(r.legalName && { legalName: r.legalName }),
            ...(r.contactName && { contactName: r.contactName }),
            ...(r.phone && { phone: r.phone }),
            ...(r.mobile && { mobile: r.mobile }),
            ...(r.email && { email: r.email }),
            ...(r.address && { address: r.address }),
            ...(r.city && { city: r.city }),
            ...(r.notes && { notes: r.notes }),
          };

          if (r.document) {
            const existing = existingByDoc.get(r.document);
            if (existing) {
              await prisma.supplier.update({ where: { id: existing.id }, data });
              results.updated++;
            } else {
              const created = await prisma.supplier.create({ data: { ...data, document: r.document, businessId } });
              // Para que otra fila del mismo archivo con este mismo documento
              // (ver advertencia de arriba) actualice en vez de intentar crear un
              // duplicado — el unique constraint (businessId, document) lo rechazaría.
              existingByDoc.set(r.document, { id: created.id, document: r.document });
              results.imported++;
            }
          } else {
            await prisma.supplier.create({ data: { ...data, businessId } });
            results.imported++;
          }
        } catch (err: any) {
          results.errors.push({ row: r.rowNum, message: `"${r.name}": ${err.message ?? 'Error desconocido'}` });
        }
      }

      return success(res, results, `Importación: ${results.imported} creados, ${results.updated} actualizados`);
    } catch (err) { next(err); }
  },
);

// ── Standard CRUD ────────────────────────────────────────────────────────────
router.get('/', supplierController.list);
router.get('/:id', supplierController.getOne);
// CASHIER puede crear un proveedor nuevo al vuelo (ej. registrando una compra
// de un proveedor que aún no existe en el sistema), pero no editar/eliminar
// uno existente — eso sigue siendo de ADMIN/SUPERVISOR.
router.post('/', authorize('ADMIN', 'SUPERVISOR', 'CASHIER'), planLimit.suppliers(), supplierController.create);
router.put('/:id', authorize('ADMIN', 'SUPERVISOR'), supplierController.update);
router.delete('/:id', authorize('ADMIN'), supplierController.delete);

export default router;
