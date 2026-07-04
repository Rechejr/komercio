import { Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../config/database';
import { AppError } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';

const MAX_EXPORT_DAYS = 366;
const MAX_EXPORT_ROWS = 50_000;
const BATCH_SIZE = 1_000;

function parseDate(val: unknown, fallback: Date): Date {
  if (typeof val === 'string' && val) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return fallback;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(n: unknown): number {
  return Number(n || 0);
}

function initStreamWriter(res: Response, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
}

function styleHeaderStream(ws: ExcelJS.Worksheet) {
  const row = ws.getRow(1);
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  row.alignment = { vertical: 'middle' };
  row.height = 18;
  row.commit();
}

export const exportController = {
  async exportSales(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const start = parseDate(req.query.startDate, new Date(now.getFullYear(), now.getMonth(), 1));
      const end = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_EXPORT_DAYS) {
        return next(new AppError(`El rango de exportación no puede superar ${MAX_EXPORT_DAYS} días`, 400));
      }

      const start0 = start.toISOString().split('T')[0];
      const end0 = end.toISOString().split('T')[0];
      const wb = initStreamWriter(res, `ventas-${start0}-${end0}.xlsx`);

      const ws1 = wb.addWorksheet('Ventas');
      ws1.columns = [
        { header: 'N° Factura',     key: 'invoice',  width: 20 },
        { header: 'Fecha',          key: 'date',     width: 14 },
        { header: 'Cliente',        key: 'customer', width: 24 },
        { header: 'Vendedor',       key: 'seller',   width: 22 },
        { header: 'Método Pago',    key: 'method',   width: 16 },
        { header: 'Estado',         key: 'status',   width: 14 },
        { header: 'Subtotal ($)',   key: 'subtotal', width: 16 },
        { header: 'Descuento ($)',  key: 'discount', width: 16 },
        { header: 'IVA ($)',        key: 'tax',      width: 14 },
        { header: 'Total ($)',      key: 'total',    width: 16 },
      ];
      styleHeaderStream(ws1);

      const ws2 = wb.addWorksheet('Detalle productos');
      ws2.columns = [
        { header: 'N° Factura',       key: 'invoice',  width: 20 },
        { header: 'Fecha',            key: 'date',     width: 14 },
        { header: 'Cliente',          key: 'customer', width: 24 },
        { header: 'Código',           key: 'code',     width: 14 },
        { header: 'Producto',         key: 'product',  width: 30 },
        { header: 'Cantidad',         key: 'qty',      width: 12 },
        { header: 'Precio Unit. ($)', key: 'price',    width: 18 },
        { header: 'Desc. %',          key: 'disc',     width: 10 },
        { header: 'Total Línea ($)',  key: 'lineTotal', width: 18 },
      ];
      styleHeaderStream(ws2);

      const where = { createdAt: { gte: start, lte: end }, deletedAt: null, branch: { businessId: req.user!.businessId } };
      let lastId: string | undefined;
      let fetched = 0;

      while (fetched < MAX_EXPORT_ROWS) {
        const batch = await prisma.sale.findMany({
          where,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: Math.min(BATCH_SIZE, MAX_EXPORT_ROWS - fetched),
          ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
          include: {
            customer: { select: { name: true } },
            user: { select: { name: true } },
            details: { include: { product: { select: { name: true, code: true } } } },
          },
        });

        if (batch.length === 0) break;

        for (const s of batch) {
          ws1.addRow({
            invoice: s.invoiceNumber,
            date: fmtDate(s.createdAt),
            customer: s.customer?.name || 'Mostrador',
            seller: s.user?.name || '',
            method: String(s.paymentMethod),
            status: s.status,
            subtotal: fmtMoney(s.subtotal),
            discount: fmtMoney(s.discountAmount),
            tax: fmtMoney(s.taxAmount),
            total: fmtMoney(s.total),
          }).commit();
          for (const d of s.details) {
            ws2.addRow({
              invoice: s.invoiceNumber,
              date: fmtDate(s.createdAt),
              customer: s.customer?.name || 'Mostrador',
              code: d.product?.code || '',
              product: d.product?.name || '',
              qty: d.quantity,
              price: fmtMoney(d.unitPrice),
              disc: d.discountPct,
              lineTotal: fmtMoney(d.total),
            }).commit();
          }
        }

        fetched += batch.length;
        lastId = batch[batch.length - 1].id;
        if (batch.length < BATCH_SIZE) break;
      }

      ws1.commit();
      ws2.commit();
      await wb.commit();
    } catch (err) { next(err); }
  },

  async exportPurchases(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const start = parseDate(req.query.startDate, new Date(now.getFullYear(), now.getMonth(), 1));
      const end = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_EXPORT_DAYS) {
        return next(new AppError(`El rango de exportación no puede superar ${MAX_EXPORT_DAYS} días`, 400));
      }

      const start0 = start.toISOString().split('T')[0];
      const end0 = end.toISOString().split('T')[0];
      const wb = initStreamWriter(res, `compras-${start0}-${end0}.xlsx`);

      const ws1 = wb.addWorksheet('Compras');
      ws1.columns = [
        { header: 'N° Factura Proveedor', key: 'invoice',  width: 24 },
        { header: 'Fecha',               key: 'date',     width: 14 },
        { header: 'Proveedor',           key: 'supplier', width: 26 },
        { header: 'Cant. Productos',     key: 'items',    width: 16 },
        { header: 'Subtotal ($)',        key: 'subtotal', width: 16 },
        { header: 'IVA ($)',             key: 'tax',      width: 14 },
        { header: 'Total ($)',           key: 'total',    width: 16 },
        { header: 'Notas',               key: 'notes',    width: 30 },
      ];
      styleHeaderStream(ws1);

      const ws2 = wb.addWorksheet('Detalle productos');
      ws2.columns = [
        { header: 'N° Factura Proveedor', key: 'invoice',  width: 24 },
        { header: 'Fecha',               key: 'date',     width: 14 },
        { header: 'Proveedor',           key: 'supplier', width: 26 },
        { header: 'Código',              key: 'code',     width: 14 },
        { header: 'Producto',            key: 'product',  width: 30 },
        { header: 'Cantidad',            key: 'qty',      width: 12 },
        { header: 'Costo Unit. ($)',     key: 'cost',     width: 18 },
        { header: 'IVA %',               key: 'taxRate',  width: 10 },
        { header: 'Total Línea ($)',     key: 'lineTotal', width: 18 },
      ];
      styleHeaderStream(ws2);

      const where = { purchaseDate: { gte: start, lte: end }, deletedAt: null, businessId: req.user!.businessId };
      let lastId: string | undefined;
      let fetched = 0;

      while (fetched < MAX_EXPORT_ROWS) {
        const batch = await prisma.purchase.findMany({
          where,
          orderBy: [{ purchaseDate: 'asc' }, { id: 'asc' }],
          take: Math.min(BATCH_SIZE, MAX_EXPORT_ROWS - fetched),
          ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
          include: {
            supplier: { select: { name: true } },
            details: { include: { product: { select: { name: true, code: true } } } },
          },
        });

        if (batch.length === 0) break;

        for (const p of batch) {
          ws1.addRow({
            invoice: p.invoiceNumber || '',
            date: fmtDate(p.purchaseDate),
            supplier: p.supplier?.name || '',
            items: p.details.length,
            subtotal: fmtMoney(p.subtotal),
            tax: fmtMoney(p.taxAmount),
            total: fmtMoney(p.total),
            notes: p.notes || '',
          }).commit();
          for (const d of p.details) {
            ws2.addRow({
              invoice: p.invoiceNumber || '',
              date: fmtDate(p.purchaseDate),
              supplier: p.supplier?.name || '',
              code: d.product?.code || '',
              product: d.product?.name || '',
              qty: d.quantity,
              cost: fmtMoney(d.unitCost),
              taxRate: d.taxRate,
              lineTotal: fmtMoney(d.total),
            }).commit();
          }
        }

        fetched += batch.length;
        lastId = batch[batch.length - 1].id;
        if (batch.length < BATCH_SIZE) break;
      }

      ws1.commit();
      ws2.commit();
      await wb.commit();
    } catch (err) { next(err); }
  },

  async exportExpenses(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const start = parseDate(req.query.startDate, new Date(now.getFullYear(), now.getMonth(), 1));
      const end = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_EXPORT_DAYS) {
        return next(new AppError(`El rango de exportación no puede superar ${MAX_EXPORT_DAYS} días`, 400));
      }

      const start0 = start.toISOString().split('T')[0];
      const end0 = end.toISOString().split('T')[0];
      const wb = initStreamWriter(res, `gastos-${start0}-${end0}.xlsx`);

      const ws = wb.addWorksheet('Gastos');
      ws.columns = [
        { header: 'Fecha',        key: 'date',     width: 14 },
        { header: 'Descripción',  key: 'desc',     width: 38 },
        { header: 'Categoría',    key: 'category', width: 22 },
        { header: 'Método Pago',  key: 'method',   width: 16 },
        { header: 'Monto ($)',    key: 'amount',   width: 16 },
        { header: 'Notas',        key: 'notes',    width: 30 },
      ];
      styleHeaderStream(ws);

      const where = { date: { gte: start, lte: end }, deletedAt: null, businessId: req.user!.businessId };
      let lastId: string | undefined;
      let fetched = 0;
      let total = 0;

      while (fetched < MAX_EXPORT_ROWS) {
        const batch = await prisma.expense.findMany({
          where,
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
          take: Math.min(BATCH_SIZE, MAX_EXPORT_ROWS - fetched),
          ...(lastId ? { skip: 1, cursor: { id: lastId } } : {}),
          include: { category: { select: { name: true } } },
        });

        if (batch.length === 0) break;

        for (const e of batch) {
          total += Number(e.amount || 0);
          ws.addRow({
            date: fmtDate(e.date),
            desc: e.description,
            category: e.category?.name || 'Sin categoría',
            method: String(e.paymentMethod),
            amount: fmtMoney(e.amount),
            notes: e.notes || '',
          }).commit();
        }

        fetched += batch.length;
        lastId = batch[batch.length - 1].id;
        if (batch.length < BATCH_SIZE) break;
      }

      if (fetched > 0) {
        const totalRow = ws.addRow({ date: '', desc: 'TOTAL', category: '', method: '', amount: total, notes: '' });
        totalRow.font = { bold: true };
        totalRow.getCell('amount').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
        totalRow.commit();
      }

      ws.commit();
      await wb.commit();
    } catch (err) { next(err); }
  },
};