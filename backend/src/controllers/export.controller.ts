import { Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../config/database';
import { AuthRequest } from '../middlewares/auth';

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

function fmtMoney(n: number | null | undefined): number {
  return Number(n || 0);
}

async function sendExcel(res: Response, wb: ExcelJS.Workbook, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

function styleHeader(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { vertical: 'middle' };
  headerRow.height = 18;
}

export const exportController = {
  async exportSales(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const start = parseDate(req.query.startDate, new Date(now.getFullYear(), now.getMonth(), 1));
      const end = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      const sales = await prisma.sale.findMany({
        where: { createdAt: { gte: start, lte: end }, deletedAt: null, branch: { businessId: req.user!.businessId } },
        orderBy: { createdAt: 'asc' },
        include: {
          customer: { select: { name: true } },
          user: { select: { name: true } },
          details: { include: { product: { select: { name: true, code: true } } } },
        },
      });

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Komercio';
      wb.created = new Date();

      // Sheet 1: Summary
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
      styleHeader(ws1);
      for (const s of sales) {
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
        });
      }

      // Sheet 2: Detail
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
      styleHeader(ws2);
      for (const s of sales) {
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
          });
        }
      }

      const start0 = start.toISOString().split('T')[0];
      const end0 = end.toISOString().split('T')[0];
      await sendExcel(res, wb, `ventas-${start0}-${end0}.xlsx`);
    } catch (err) { next(err); }
  },

  async exportPurchases(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const start = parseDate(req.query.startDate, new Date(now.getFullYear(), now.getMonth(), 1));
      const end = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      const purchases = await prisma.purchase.findMany({
        where: { purchaseDate: { gte: start, lte: end }, deletedAt: null, businessId: req.user!.businessId },
        orderBy: { purchaseDate: 'asc' },
        include: {
          supplier: { select: { name: true } },
          details: { include: { product: { select: { name: true, code: true } } } },
        },
      });

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Komercio';
      wb.created = new Date();

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
      styleHeader(ws1);
      for (const p of purchases) {
        ws1.addRow({
          invoice: p.invoiceNumber || '',
          date: fmtDate(p.purchaseDate),
          supplier: p.supplier?.name || '',
          items: p.details.length,
          subtotal: fmtMoney(p.subtotal),
          tax: fmtMoney(p.taxAmount),
          total: fmtMoney(p.total),
          notes: p.notes || '',
        });
      }

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
      styleHeader(ws2);
      for (const p of purchases) {
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
          });
        }
      }

      const start0 = start.toISOString().split('T')[0];
      const end0 = end.toISOString().split('T')[0];
      await sendExcel(res, wb, `compras-${start0}-${end0}.xlsx`);
    } catch (err) { next(err); }
  },

  async exportExpenses(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const start = parseDate(req.query.startDate, new Date(now.getFullYear(), now.getMonth(), 1));
      const end = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      const expenses = await prisma.expense.findMany({
        where: { date: { gte: start, lte: end }, deletedAt: null, businessId: req.user!.businessId },
        orderBy: { date: 'asc' },
        include: { category: { select: { name: true } } },
      });

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Komercio';
      wb.created = new Date();

      const ws = wb.addWorksheet('Gastos');
      ws.columns = [
        { header: 'Fecha',        key: 'date',     width: 14 },
        { header: 'Descripción',  key: 'desc',     width: 38 },
        { header: 'Categoría',    key: 'category', width: 22 },
        { header: 'Método Pago',  key: 'method',   width: 16 },
        { header: 'Monto ($)',    key: 'amount',   width: 16 },
        { header: 'Notas',        key: 'notes',    width: 30 },
      ];
      styleHeader(ws);
      for (const e of expenses) {
        ws.addRow({
          date: fmtDate(e.date),
          desc: e.description,
          category: e.category?.name || 'Sin categoría',
          method: String(e.paymentMethod),
          amount: fmtMoney(e.amount),
          notes: e.notes || '',
        });
      }

      // Total row
      if (expenses.length > 0) {
        const total = expenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
        const totalRow = ws.addRow({ date: '', desc: 'TOTAL', category: '', method: '', amount: total, notes: '' });
        totalRow.font = { bold: true };
        totalRow.getCell('amount').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      }

      const start0 = start.toISOString().split('T')[0];
      const end0 = end.toISOString().split('T')[0];
      await sendExcel(res, wb, `gastos-${start0}-${end0}.xlsx`);
    } catch (err) { next(err); }
  },
};
