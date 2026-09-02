import { Router } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { authenticate, authorize } from '../middlewares/auth';
import { success, paginated, AppError } from '../utils/response';
import { getPagination } from '../utils/pagination';
import { validate } from '../middlewares/validate';
import { resolvePayment } from '../utils/paymentAccount';
import { parseBogotaBoundary } from '../utils/bogotaTime';
import { planLimit } from '../middlewares/planLimit';
import { AuthRequest } from '../middlewares/auth';
import ExcelJS from 'exceljs';
import multer from 'multer';
import { findDataSheet, findHeaderRow, mapColumns, cellVal, normalizeHeader } from '../utils/excelParser';

// Cuentas por pagar: lo que el negocio le debe a sus proveedores por compras a
// crédito. Espejo de créditos/fiados de clientes, pero al ABONAR sale plata de
// la caja (pagar al proveedor), en vez de entrar.
const router = Router();

// ── Plantilla (sin sesión: es un archivo en blanco, no lleva datos de nadie) ──
router.get('/import-template', async (_req, res, next) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cuentas por pagar');

    ws.columns = [
      { header: 'Proveedor',   key: 'proveedor', width: 30 },
      { header: 'Factura',     key: 'factura',   width: 18 },
      { header: 'Valor total', key: 'total',     width: 16 },
      { header: 'Abonado',     key: 'abonado',   width: 14 },
      { header: 'Vence',       key: 'vence',     width: 14 },
      { header: 'Notas',       key: 'notas',     width: 30 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
      cell.alignment = { horizontal: 'center' };
    });

    // Ejemplos: uno sin abonos, uno con abono parcial y uno sin fecha de pago.
    ws.addRow({ proveedor: 'Distribuidora El Sol', factura: 'FV-1024', total: 1500000, abonado: 0, vence: '2026-10-15', notas: 'Mercancía de octubre' });
    ws.addRow({ proveedor: 'Maderas del Norte', factura: 'FV-877', total: 800000, abonado: 300000, vence: '2026-09-30', notas: '' });
    ws.addRow({ proveedor: 'Textiles Andinos', factura: '', total: 250000, abonado: 0, vence: '', notas: 'Sin plazo acordado' });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=plantilla-cuentas-por-pagar.xlsx');
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
      'application/csv',
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new AppError('Solo se permiten archivos Excel (.xlsx, .xls) o CSV', 400));
    }
    cb(null, true);
  },
});

// Encabezados que puede traer el Excel del negocio. Se aceptan sinónimos porque
// cada quien nombra sus columnas distinto y nadie va a renombrarlas a mano.
const PAYABLE_COL_DEFS: Record<string, string[]> = {
  proveedor: ['proveedor', 'supplier', 'nombre', 'razon social', 'razon', 'empresa',
              'acreedor', 'nombre proveedor', 'beneficiario'],
  factura:   ['factura', 'invoice', 'numero factura', 'num factura', 'no factura',
              'n factura', 'documento', 'referencia', 'remision', 'consecutivo'],
  total:     ['valor total', 'total', 'valor', 'monto', 'importe', 'deuda',
              'valor factura', 'total factura', 'amount'],
  abonado:   ['abonado', 'abono', 'pagado', 'valor pagado', 'anticipo', 'paid'],
  vence:     ['vence', 'vencimiento', 'fecha vencimiento', 'fecha de vencimiento',
              'fecha pago', 'fecha de pago', 'plazo', 'due date', 'fecha limite'],
  notas:     ['notas', 'nota', 'observaciones', 'observacion', 'comentarios', 'detalle'],
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

const PAYABLE_FIELD_LABELS: Record<string, string> = {
  proveedor: 'Proveedor', factura: 'Factura', total: 'Valor total',
  abonado: 'Abonado', vence: 'Vence', notas: 'Notas',
};

router.get('/', async (req: any, res, next) => {
  try {
    const { page, limit, skip } = getPagination(req);
    const { status, supplierId, startDate, endDate } = req.query;
    const businessId = req.user.businessId;

    const where: any = { deletedAt: null, businessId };
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    // Rango por día calendario colombiano sobre la fecha de creación.
    const gte = parseBogotaBoundary(startDate, 'start');
    const lte = parseBogotaBoundary(endDate, 'end');
    if (gte || lte) where.createdAt = { ...(gte && { gte }), ...(lte && { lte }) };

    const [rows, total] = await Promise.all([
      prisma.supplierCredit.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { id: true, name: true, phone: true, mobile: true } },
          purchase: { select: { invoiceNumber: true } },
          _count: { select: { payments: true } },
        },
      }),
      prisma.supplierCredit.count({ where }),
    ]);
    return paginated(res, rows, total, page, limit);
  } catch (err) { next(err); }
});

router.get('/:id', async (req: any, res, next) => {
  try {
    const credit = await prisma.supplierCredit.findFirst({
      where: { id: req.params.id, deletedAt: null, businessId: req.user.businessId },
      include: {
        supplier: true,
        purchase: { select: { invoiceNumber: true, purchaseDate: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!credit) throw new AppError('Cuenta por pagar no encontrada', 404);
    return success(res, credit);
  } catch (err) { next(err); }
});

// Abonar a un proveedor: paga parte del saldo → SALE plata de la caja.
// ── Importación masiva (admite ?dryRun=true para la vista previa) ─────────────
// Sirve para cargar de una las facturas que el negocio ya tiene pendientes con
// sus proveedores, en vez de teclearlas una por una al empezar a usar Ventrix.
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

      const allAliases = Object.values(PAYABLE_COL_DEFS).flat();
      const headerRowNum = findHeaderRow(ws, allAliases);
      const headers: string[] = [];
      ws.getRow(headerRowNum).eachCell((cell) => {
        headers.push(normalizeHeader(String(cell.value ?? '')));
      });
      const { col, detectedColumns } = mapColumns(headers, PAYABLE_COL_DEFS);

      if (col.proveedor === -1) {
        throw new AppError('No se encontró la columna del proveedor. Asegúrate de tener una columna "Proveedor".', 400);
      }
      if (col.total === -1) {
        throw new AppError('No se encontró la columna del valor. Asegúrate de tener una columna "Valor total".', 400);
      }

      const detectedColumnsLabeled = detectedColumns.map((d) => ({
        field: d.field,
        header: `${d.header} → ${PAYABLE_FIELD_LABELS[d.field] ?? d.field}`,
      }));

      interface Fila {
        rowNum: number; proveedor: string; factura: string | null;
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
        const proveedor = cellVal(row, col.proveedor);
        if (!proveedor) continue;
        totalRows++;

        const total = leerMontoLocal(cellVal(row, col.total));
        if (!total || isNaN(total) || total <= 0) {
          issues.push({ row: rowNum, name: proveedor, message: 'Sin valor válido — no se puede importar', type: 'error' });
          continue;
        }

        const abonado = col.abonado !== -1 ? (leerMontoLocal(cellVal(row, col.abonado)) || 0) : 0;
        if (abonado > total) {
          issues.push({ row: rowNum, name: proveedor, message: 'Lo abonado supera el valor total — se importa sin abono', type: 'warning' });
        }
        const abonadoOk = abonado > 0 && abonado <= total ? abonado : 0;

        const vence = col.vence !== -1 ? leerFechaLocal(cellVal(row, col.vence)) : null;
        if (col.vence !== -1 && cellVal(row, col.vence) && !vence) {
          issues.push({ row: rowNum, name: proveedor, message: 'Fecha de vencimiento no reconocida — queda sin plazo', type: 'warning' });
        }

        validRows.push({
          rowNum, proveedor,
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

      // Proveedores que ya existen (por nombre, sin distinguir mayúsculas). Los
      // que no, se crean: es preferible eso a rechazar la fila y dejar al negocio
      // cargando proveedores a mano antes de poder importar sus cuentas.
      const nombres = Array.from(new Set(validRows.map((r) => r.proveedor)));
      const existentes = nombres.length > 0
        ? await prisma.supplier.findMany({
            where: { businessId, deletedAt: null, name: { in: nombres, mode: 'insensitive' } },
            select: { id: true, name: true },
          })
        : [];
      const porNombre = new Map(existentes.map((s) => [s.name.toLowerCase(), s.id]));

      if (dryRun) {
        return success(res, {
          total: totalRows,
          valid: validRows.length,
          toCreate: validRows.length,
          proveedoresNuevos: nombres.filter((n) => !porNombre.has(n.toLowerCase())).length,
          issues,
          detectedColumns: detectedColumnsLabeled,
        }, 'Vista previa generada');
      }

      const results = {
        imported: 0,
        proveedoresCreados: 0,
        errors: issues
          .filter((i) => i.type === 'error')
          .map((i) => ({ row: i.row, message: `"${i.name}": ${i.message}` })),
      };

      for (const r of validRows) {
        try {
          let supplierId = porNombre.get(r.proveedor.toLowerCase());
          if (!supplierId) {
            const nuevo = await prisma.supplier.create({
              data: { businessId, name: r.proveedor },
              select: { id: true },
            });
            supplierId = nuevo.id;
            porNombre.set(r.proveedor.toLowerCase(), supplierId);
            results.proveedoresCreados++;
          }

          const balance = r.total - r.abonado;
          await prisma.supplierCredit.create({
            data: {
              businessId, supplierId,
              totalAmount: r.total,
              paidAmount: r.abonado,
              balance,
              status: balance <= 0 ? 'PAID' : r.abonado > 0 ? 'PARTIAL' : 'PENDING',
              dueDate: r.vence,
              notes: [r.factura ? `Factura ${r.factura}` : null, r.notas].filter(Boolean).join(' — ') || null,
            },
          });
          results.imported++;
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Error desconocido';
          results.errors.push({ row: r.rowNum, message: `"${r.proveedor}": ${msg}` });
        }
      }

      await cache.del(`dashboard:${businessId}`).catch(() => {});
      return success(res, results, `Importación: ${results.imported} cuentas creadas${results.proveedoresCreados ? `, ${results.proveedoresCreados} proveedores nuevos` : ''}`);
    } catch (err) { next(err); }
  },
);

router.post('/:id/payments',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER'),
  [
    body('amount').isFloat({ gt: 0 }).withMessage('El monto debe ser mayor a 0'),
    body('paymentMethod').optional().isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD']),
    body('paymentAccountId').optional({ nullable: true }).isString(),
    body('notes').optional().trim(),
  ],
  validate,
  async (req: any, res: any, next: any) => {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, paymentAccountId, notes } = req.body;
      const paymentAmount = parseFloat(amount);
      if (!(paymentAmount > 0)) throw new AppError('El monto debe ser mayor a 0', 400);

      const businessId = req.user.businessId;
      const pay = await resolvePayment({ paymentAccountId, paymentMethod }, businessId);

      const [newBalance, newStatus, supplierName] = await prisma.$transaction(async (tx) => {
        const [locked] = await tx.$queryRaw<any[]>`
          SELECT id, "totalAmount", "paidAmount", balance, status, "supplierId"
          FROM supplier_credits
          WHERE id::text = ${id} AND "deletedAt" IS NULL AND "businessId" = ${businessId}
          FOR UPDATE
        `;
        if (!locked) throw new AppError('Cuenta por pagar no encontrada', 404);
        if (locked.status === 'PAID') throw new AppError('Esta cuenta ya está saldada', 400);
        if (locked.status === 'CANCELLED') throw new AppError('Esta cuenta está anulada', 400);

        const currentBalance = Number(locked.balance);
        if (paymentAmount > currentBalance + 1) throw new AppError('El pago supera el saldo pendiente', 400);

        const newPaid = Number(locked.paidAmount) + paymentAmount;
        const balance = Math.max(0, Number(locked.totalAmount) - newPaid);
        // Un abono parcial a una cuenta vencida no la pone al día (sigue OVERDUE
        // hasta saldar), igual que el fiado de cliente.
        const status = balance <= 0
          ? 'PAID'
          : locked.status === 'OVERDUE' ? 'OVERDUE' : (newPaid > 0 ? 'PARTIAL' : 'PENDING');

        await tx.supplierCreditPayment.create({
          data: { supplierCreditId: id, amount: paymentAmount, paymentMethod: pay.paymentMethod, paymentAccountId: pay.paymentAccountId, notes },
        });
        await tx.supplierCredit.update({ where: { id }, data: { paidAmount: newPaid, balance, status: status as any } });

        const supplier = await tx.supplier.findUnique({ where: { id: locked.supplierId }, select: { currentDebt: true, name: true } });
        const safeDecrement = Math.min(paymentAmount, Math.max(0, Number(supplier?.currentDebt ?? paymentAmount)));
        await tx.supplier.update({ where: { id: locked.supplierId }, data: { currentDebt: { decrement: safeDecrement } } });

        return [balance, status, supplier?.name] as const;
      });

      // Pagar al proveedor SACA plata de la caja (best-effort, no rompe el abono).
      if (pay.paymentMethod === 'CASH') {
        try {
          const branchId = req.user.branchId;
          if (branchId) {
            const openRegister = await prisma.cashRegister.findFirst({ where: { branchId, status: 'OPEN' } });
            if (openRegister) {
              await prisma.cashMovement.create({
                data: {
                  cashRegisterId: openRegister.id, type: 'OUT', amount: paymentAmount,
                  description: `Pago a proveedor${supplierName ? ` — ${supplierName}` : ''}`,
                  referenceId: id, createdById: req.user.userId,
                },
              });
            }
          }
        } catch { /* no debe fallar el abono */ }
      }

      await cache.del(`dashboard:${businessId}`).catch(() => {});
      return success(res, { newBalance, status: newStatus }, 'Pago registrado');
    } catch (err) { next(err); }
  },
);

export default router;
