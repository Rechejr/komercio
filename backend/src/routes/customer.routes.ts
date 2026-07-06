import { Router } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import ExcelJS from 'exceljs';
import { customerController } from '../controllers/customer.controller';
import { authenticate, authorize, AuthRequest } from '../middlewares/auth';
import { planLimit } from '../middlewares/planLimit';
import { validate } from '../middlewares/validate';
import { prisma } from '../config/database';
import { success, AppError } from '../utils/response';
import {
  findDataSheet, findHeaderRow, mapColumns, cellVal,
  parseNum, normalizePhone, normalizeDocument, isValidEmail, normalizeHeader,
} from '../utils/excelParser';

const router = Router();

// ── Template download (no auth — blank file, no user data) ───────────────────
router.get('/import-template', async (_req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Clientes');

    ws.columns = [
      { header: 'Nombre',           key: 'name',        width: 30 },
      { header: 'Documento (CC/NIT)',key: 'document',    width: 18 },
      { header: 'Teléfono',         key: 'phone',        width: 15 },
      { header: 'Email',            key: 'email',        width: 28 },
      { header: 'Dirección',        key: 'address',      width: 28 },
      { header: 'Ciudad',           key: 'city',         width: 15 },
      { header: 'Límite de crédito',key: 'creditLimit',  width: 18 },
      { header: 'Notas',            key: 'notes',        width: 30 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center' };
    });

    ws.addRow({ name: 'María González', document: '52891234', phone: '3152891234', email: 'maria@email.com', address: 'Cra 5 #10-20', city: 'Bogotá', creditLimit: 500000, notes: 'Cliente preferencial' });
    ws.addRow({ name: 'Juan Pérez', document: '1023456789', phone: '3001234567', email: '', address: 'Calle 50 #20-15', city: 'Medellín', creditLimit: 0, notes: '' });
    ws.addRow({ name: 'Luz Marina Torres', document: '', phone: '3209876543', email: '', address: '', city: 'Cali', creditLimit: 200000, notes: 'Fiada' });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla-clientes.xlsx');
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

const CUSTOMER_COL_DEFS: Record<string, string[]> = {
  name:        ['nombre', 'name', 'cliente', 'nombres y apellidos', 'nombre completo',
                 'denominacion', 'persona', 'razon social', 'razon'],
  document:    ['documento', 'document', 'cedula', 'cc', 'nit', 'identificacion',
                 'num documento', 'numero documento', 'num. documento', 'doc',
                 'rut', 'dni', 'cuil', 'id', 'numero de identidad'],
  phone:       ['telefono', 'phone', 'tel', 'cel', 'celular', 'movil', 'whatsapp',
                 'contacto', 'numero', 'numero celular', 'num. celular'],
  email:       ['email', 'correo', 'mail', 'e-mail', 'correo electronico'],
  address:     ['direccion', 'address', 'dir', 'domicilio', 'ubicacion', 'calle'],
  city:        ['ciudad', 'city', 'municipio', 'localidad', 'poblacion', 'departamento'],
  creditLimit: ['limite credito', 'limite de credito', 'credito', 'credit limit',
                 'cupo', 'cupo credito', 'cupo de credito', 'creditlimit',
                 'fiado', 'saldo limite', 'limite'],
  notes:       ['notas', 'notes', 'observaciones', 'observacion', 'comentarios',
                 'nota', 'detalle', 'informacion', 'descripcion'],
};

const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', document: 'Documento', phone: 'Teléfono', email: 'Correo',
  address: 'Dirección', city: 'Ciudad', creditLimit: 'Límite crédito', notes: 'Notas',
};

// ── Bulk import (supports ?dryRun=true for preview) ──────────────────────────
router.post('/import',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'),
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

      // Collect all aliases flat for header-row scoring
      const allAliases = Object.values(CUSTOMER_COL_DEFS).flat();
      const headerRowNum = findHeaderRow(ws, allAliases);

      const headers: string[] = [];
      ws.getRow(headerRowNum).eachCell((cell) => {
        headers.push(normalizeHeader(String(cell.value ?? '')));
      });

      const { col, detectedColumns } = mapColumns(headers, CUSTOMER_COL_DEFS);

      if (col.name === -1) {
        throw new AppError(
          'No se encontró columna de nombre. Asegúrate de tener una columna "Nombre" o "Cliente".',
          400,
        );
      }

      // Enrich detectedColumns with human-readable labels
      const detectedColumnsLabeled = detectedColumns.map((d) => ({
        field: d.field,
        header: `${d.header} → ${CUSTOMER_FIELD_LABELS[d.field] ?? d.field}`,
      }));

      interface ParsedRow {
        rowNum: number;
        name: string;
        document: string | null;
        phone: string | null;
        email: string | null;
        address: string | null;
        city: string | null;
        creditLimit: number;
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

        // Duplicate document within file
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

        // Email validation (warning, not error — we still import)
        const rawEmail = cellVal(row, col.email);
        const email = rawEmail || null;
        if (email && !isValidEmail(email)) {
          issues.push({ row: rowNum, name, message: `Email "${email}" no es válido`, type: 'warning' });
        }

        const rawPhone = cellVal(row, col.phone);
        const phone = rawPhone ? normalizePhone(rawPhone) : null;

        const creditLimit = parseNum(cellVal(row, col.creditLimit));

        validRows.push({
          rowNum, name, document: doc,
          phone, email: email && isValidEmail(email) ? email.toLowerCase().trim() : null,
          address: cellVal(row, col.address) || null,
          city: cellVal(row, col.city) || null,
          creditLimit,
          notes: cellVal(row, col.notes) || null,
        });
      }

      if (dryRun) {
        const docsInFile = validRows.map((r) => r.document).filter((d): d is string => !!d);
        const existing = docsInFile.length > 0
          ? await prisma.customer.findMany({
              where: { businessId, document: { in: docsInFile } },
              select: { document: true },
            })
          : [];
        const existingDocs = new Set(existing.map((c) => c.document).filter((d): d is string => !!d));

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

      for (const r of validRows) {
        try {
          const data = {
            name: r.name,
            ...(r.phone && { phone: r.phone }),
            ...(r.email && { email: r.email }),
            ...(r.address && { address: r.address }),
            ...(r.city && { city: r.city }),
            creditLimit: r.creditLimit,
            ...(r.notes && { notes: r.notes }),
          };

          if (r.document) {
            const existing = await prisma.customer.findFirst({
              where: { businessId, document: r.document },
              select: { id: true },
            });
            if (existing) {
              await prisma.customer.update({ where: { id: existing.id }, data });
              results.updated++;
            } else {
              await prisma.customer.create({ data: { ...data, document: r.document, businessId } });
              results.imported++;
            }
          } else {
            await prisma.customer.create({ data: { ...data, businessId } });
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
const customerBodyValidators = [
  body('name').trim().notEmpty().withMessage('El nombre es requerido'),
  body('email').optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail().withMessage('Email inválido'),
  body('phone').optional({ nullable: true, checkFalsy: true }).trim(),
  body('creditLimit').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Límite de crédito inválido'),
];

router.get('/', customerController.list);
router.get('/:id', customerController.getOne);
router.get('/:id/purchases', customerController.getPurchaseHistory);
router.post('/',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'),
  planLimit.customers(),
  customerBodyValidators,
  validate,
  customerController.create,
);
router.put('/:id',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'),
  [
    body('name').optional().trim().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('email').optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail().withMessage('Email inválido'),
    body('phone').optional({ nullable: true, checkFalsy: true }).trim(),
    body('creditLimit').optional({ nullable: true, checkFalsy: true }).isFloat({ min: 0 }).withMessage('Límite de crédito inválido'),
  ],
  validate,
  customerController.update,
);
router.delete('/:id', authorize('ADMIN', 'SUPERVISOR'), customerController.delete);

export default router;
