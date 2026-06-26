import { Response, NextFunction } from 'express';
import * as XLSX from 'xlsx';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';

function parseDate(val: unknown, fallback: Date): Date {
  if (typeof val === 'string' && val) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return fallback;
}

function sendExcel(res: Response, wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtMoney(n: number | null | undefined): number {
  return Number(n || 0);
}

const COL_WIDTHS = (cols: number[]) => cols.map((w) => ({ wch: w }));

/** Crea una hoja con cabeceras fijas + filas de datos (o mensaje "sin datos"). */
function makeSheet(headers: string[], rows: Record<string, unknown>[]): XLSX.WorkSheet {
  if (rows.length === 0) {
    // Cabeceras en la fila 1, mensaje en la fila 2
    const ws = XLSX.utils.aoa_to_sheet([
      headers,
      ['No hay registros para el período seleccionado'],
    ]);
    return ws;
  }
  return XLSX.utils.json_to_sheet(rows);
}

export const exportController = {
  async exportSales(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const start = parseDate(req.query.startDate, monthStart);
      const end = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      const sales = await prisma.sale.findMany({
        where: {
          createdAt: { gte: start, lte: end },
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
        include: {
          customer: { select: { name: true } },
          user: { select: { name: true } },
          details: {
            include: { product: { select: { name: true, code: true } } },
          },
        },
      });

      const summaryHeaders = ['N° Factura', 'Fecha', 'Cliente', 'Vendedor', 'Método Pago', 'Estado', 'Subtotal ($)', 'Descuento ($)', 'IVA ($)', 'Total ($)'];
      const summaryRows: Record<string, unknown>[] = sales.map((s) => ({
        'N° Factura': s.invoiceNumber,
        'Fecha': fmtDate(s.createdAt),
        'Cliente': s.customer?.name || 'Mostrador',
        'Vendedor': s.user?.name || '',
        'Método Pago': String(s.paymentMethod),
        'Estado': s.status,
        'Subtotal ($)': fmtMoney(s.subtotal),
        'Descuento ($)': fmtMoney(s.discountAmount),
        'IVA ($)': fmtMoney(s.taxAmount),
        'Total ($)': fmtMoney(s.total),
      }));

      const detailHeaders = ['N° Factura', 'Fecha', 'Cliente', 'Código', 'Producto', 'Cantidad', 'Precio Unit. ($)', 'Desc. %', 'Total Línea ($)'];
      const detailRows: Record<string, unknown>[] = [];
      for (const s of sales) {
        for (const d of s.details) {
          detailRows.push({
            'N° Factura': s.invoiceNumber,
            'Fecha': fmtDate(s.createdAt),
            'Cliente': s.customer?.name || 'Mostrador',
            'Código': d.product?.code || '',
            'Producto': d.product?.name || '',
            'Cantidad': d.quantity,
            'Precio Unit. ($)': fmtMoney(d.unitPrice),
            'Desc. %': d.discountPct,
            'Total Línea ($)': fmtMoney(d.total),
          });
        }
      }

      const wb = XLSX.utils.book_new();

      const ws1 = makeSheet(summaryHeaders, summaryRows);
      ws1['!cols'] = COL_WIDTHS([18, 12, 22, 20, 14, 12, 14, 14, 12, 14]);
      XLSX.utils.book_append_sheet(wb, ws1, 'Ventas');

      const ws2 = makeSheet(detailHeaders, detailRows);
      ws2['!cols'] = COL_WIDTHS([18, 12, 22, 12, 28, 10, 16, 10, 16]);
      XLSX.utils.book_append_sheet(wb, ws2, 'Detalle productos');

      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      sendExcel(res, wb, `ventas-${startStr}-${endStr}.xlsx`);
    } catch (err) { next(err); }
  },

  async exportPurchases(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const start = parseDate(req.query.startDate, monthStart);
      const end = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      const purchases = await prisma.purchase.findMany({
        where: {
          purchaseDate: { gte: start, lte: end },
          deletedAt: null,
        },
        orderBy: { purchaseDate: 'asc' },
        include: {
          supplier: { select: { name: true } },
          details: {
            include: { product: { select: { name: true, code: true } } },
          },
        },
      });

      const summaryHeaders = ['N° Factura Proveedor', 'Fecha', 'Proveedor', 'Cant. Productos', 'Subtotal ($)', 'IVA ($)', 'Total ($)', 'Notas'];
      const summaryRows: Record<string, unknown>[] = purchases.map((p) => ({
        'N° Factura Proveedor': p.invoiceNumber || '',
        'Fecha': fmtDate(p.purchaseDate),
        'Proveedor': p.supplier?.name || '',
        'Cant. Productos': p.details.length,
        'Subtotal ($)': fmtMoney(p.subtotal),
        'IVA ($)': fmtMoney(p.taxAmount),
        'Total ($)': fmtMoney(p.total),
        'Notas': p.notes || '',
      }));

      const detailHeaders = ['N° Factura Proveedor', 'Fecha', 'Proveedor', 'Código', 'Producto', 'Cantidad', 'Costo Unit. ($)', 'IVA %', 'Total Línea ($)'];
      const detailRows: Record<string, unknown>[] = [];
      for (const p of purchases) {
        for (const d of p.details) {
          detailRows.push({
            'N° Factura Proveedor': p.invoiceNumber || '',
            'Fecha': fmtDate(p.purchaseDate),
            'Proveedor': p.supplier?.name || '',
            'Código': d.product?.code || '',
            'Producto': d.product?.name || '',
            'Cantidad': d.quantity,
            'Costo Unit. ($)': fmtMoney(d.unitCost),
            'IVA %': d.taxRate,
            'Total Línea ($)': fmtMoney(d.total),
          });
        }
      }

      const wb = XLSX.utils.book_new();

      const ws1 = makeSheet(summaryHeaders, summaryRows);
      ws1['!cols'] = COL_WIDTHS([22, 12, 24, 14, 14, 12, 14, 28]);
      XLSX.utils.book_append_sheet(wb, ws1, 'Compras');

      const ws2 = makeSheet(detailHeaders, detailRows);
      ws2['!cols'] = COL_WIDTHS([22, 12, 24, 12, 28, 10, 16, 8, 16]);
      XLSX.utils.book_append_sheet(wb, ws2, 'Detalle productos');

      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      sendExcel(res, wb, `compras-${startStr}-${endStr}.xlsx`);
    } catch (err) { next(err); }
  },

  async exportExpenses(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const start = parseDate(req.query.startDate, monthStart);
      const end = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      const expenses = await prisma.expense.findMany({
        where: {
          date: { gte: start, lte: end },
          deletedAt: null,
        },
        orderBy: { date: 'asc' },
        include: { category: { select: { name: true } } },
      });

      const expHeaders = ['Fecha', 'Descripción', 'Categoría', 'Método Pago', 'Monto ($)', 'Notas'];
      const rows: Record<string, unknown>[] = expenses.map((e) => ({
        'Fecha': fmtDate(e.date),
        'Descripción': e.description,
        'Categoría': e.category?.name || 'Sin categoría',
        'Método Pago': String(e.paymentMethod),
        'Monto ($)': fmtMoney(e.amount),
        'Notas': e.notes || '',
      }));

      if (expenses.length > 0) {
        const total = expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
        rows.push({ 'Fecha': '', 'Descripción': 'TOTAL', 'Categoría': '', 'Método Pago': '', 'Monto ($)': total, 'Notas': '' });
      }

      const wb = XLSX.utils.book_new();
      const ws = makeSheet(expHeaders, rows);
      ws['!cols'] = COL_WIDTHS([12, 36, 20, 16, 14, 30]);
      XLSX.utils.book_append_sheet(wb, ws, 'Gastos');

      const startStr = start.toISOString().split('T')[0];
      const endStr = end.toISOString().split('T')[0];
      sendExcel(res, wb, `gastos-${startStr}-${endStr}.xlsx`);
    } catch (err) { next(err); }
  },
};
