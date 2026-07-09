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

  async exportFinancialReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const now = new Date();
      const start = parseDate(req.query.startDate, new Date(now.getFullYear(), now.getMonth(), 1));
      const end   = parseDate(req.query.endDate, now);
      end.setUTCHours(23, 59, 59, 999);

      if ((end.getTime() - start.getTime()) / 86_400_000 > MAX_EXPORT_DAYS) {
        return next(new AppError(`El rango no puede superar ${MAX_EXPORT_DAYS} días`, 400));
      }

      const businessId = req.user!.businessId!;
      const start0 = start.toISOString().split('T')[0];
      const end0   = end.toISOString().split('T')[0];

      // ── 1. Gather all data in parallel ──────────────────────────────────────
      const saleWhere     = { createdAt: { gte: start, lte: end }, deletedAt: null, branch: { businessId } };
      const expenseWhere  = { date: { gte: start, lte: end }, deletedAt: null, businessId };
      const purchaseWhere = { purchaseDate: { gte: start, lte: end }, deletedAt: null, businessId };

      const [completedSales, cancelledSales, expenses, purchases, inventory, receivables] = await Promise.all([
        // Completed sales with detail for COGS
        prisma.sale.findMany({
          where: { ...saleWhere, status: 'COMPLETED' },
          select: {
            id: true, createdAt: true, total: true, subtotal: true,
            discountAmount: true, taxAmount: true,
            details: { select: { productId: true, quantity: true, unitPrice: true, costPrice: true, total: true } },
          },
        }),
        // Cancelled sales (for context)
        prisma.sale.aggregate({ where: { ...saleWhere, status: 'CANCELLED' }, _count: { id: true }, _sum: { total: true } }),
        // Expenses with category
        prisma.expense.findMany({
          where: expenseWhere,
          select: { amount: true, description: true, date: true, category: { select: { name: true } } },
          orderBy: { date: 'asc' },
        }),
        // Purchases total for reference
        prisma.purchase.aggregate({ where: purchaseWhere, _sum: { total: true }, _count: { id: true } }),
        // Inventory valuation
        prisma.product.findMany({
          where: { businessId, isActive: true, deletedAt: null, stock: { gt: 0 } },
          select: { name: true, code: true, stock: true, costPrice: true, salePrice: true, category: { select: { name: true } } },
          orderBy: { stock: 'desc' },
          take: 1000,
        }),
        // Receivables
        prisma.customer.findMany({
          where: { businessId, currentDebt: { gt: 0 }, deletedAt: null },
          select: { name: true, document: true, currentDebt: true, creditLimit: true },
          orderBy: { currentDebt: 'desc' },
          take: 1000,
        }),
      ]);

      // ── 2. Compute P&L numbers ────────────────────────────────────────────────
      let grossRevenue = 0, totalDiscounts = 0, totalTax = 0, totalCOGS = 0;
      for (const s of completedSales) {
        grossRevenue  += Number(s.total);
        totalDiscounts+= Number(s.discountAmount);
        totalTax      += Number(s.taxAmount);
        for (const d of s.details) totalCOGS += Number(d.costPrice) * Number(d.quantity);
      }
      const netRevenue     = grossRevenue;
      const grossProfit    = netRevenue - totalCOGS;
      const grossMarginPct = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

      // Expenses by category
      const expByCat = new Map<string, number>();
      for (const e of expenses) {
        const cat = e.category?.name || 'Sin categoría';
        expByCat.set(cat, (expByCat.get(cat) || 0) + Number(e.amount));
      }
      const totalExpenses = [...expByCat.values()].reduce((a, b) => a + b, 0);
      const operatingProfit = grossProfit - totalExpenses;

      // Daily breakdown
      const dailyMap = new Map<string, { revenue: number; cogs: number; discounts: number; count: number }>();
      for (const s of completedSales) {
        const day = s.createdAt.toISOString().slice(0, 10);
        const prev = dailyMap.get(day) || { revenue: 0, cogs: 0, discounts: 0, count: 0 };
        let cogs = 0;
        for (const d of s.details) cogs += Number(d.costPrice) * Number(d.quantity);
        dailyMap.set(day, {
          revenue:   prev.revenue   + Number(s.total),
          cogs:      prev.cogs      + cogs,
          discounts: prev.discounts + Number(s.discountAmount),
          count:     prev.count     + 1,
        });
      }

      // Top products — agregado en JS a partir de completedSales.details (que ya
      // tenemos en memoria), sumando costPrice*quantity POR LÍNEA. La versión anterior
      // usaba `prisma.saleDetail.groupBy` con `_sum.costPrice * _sum.quantity`, que
      // multiplica la SUMA de costos por la SUMA de cantidades — matemáticamente
      // distinto de sumar (costo × cantidad) de cada línea salvo que el costo nunca
      // hubiera cambiado, e inflaba el costo (y por lo tanto distorsionaba la utilidad)
      // en cualquier producto vendido más de una vez con costos distintos.
      const topProductsMap = new Map<string, { qty: number; revenue: number; cogs: number }>();
      for (const s of completedSales) {
        for (const d of s.details) {
          const prev = topProductsMap.get(d.productId) || { qty: 0, revenue: 0, cogs: 0 };
          topProductsMap.set(d.productId, {
            qty: prev.qty + Number(d.quantity),
            revenue: prev.revenue + Number(d.total),
            cogs: prev.cogs + Number(d.costPrice) * Number(d.quantity),
          });
        }
      }
      const topProducts = [...topProductsMap.entries()]
        .map(([productId, v]) => ({ productId, ...v }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 20);
      const topProductIds = topProducts.map((t) => t.productId);
      const topProductNames = topProductIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: topProductIds } },
            select: { id: true, name: true, code: true },
          })
        : [];
      const nameById = new Map(topProductNames.map((p) => [p.id, p]));

      // Inventory value
      const inventoryValue = inventory.reduce((s, p) => s + Number(p.costPrice) * Number(p.stock), 0);

      // ── 3. Build the workbook (in-memory, not streaming) ────────────────────
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Ventrix';
      wb.created = new Date();

      const BLUE   = 'FF2563EB';
      const GREEN  = 'FF16A34A';
      const RED    = 'FFDC2626';
      const AMBER  = 'FFD97706';
      const LGRAY  = 'FFF1F5F9';
      const WHITE  = 'FFFFFFFF';
      const DARK   = 'FF1E293B';

      function money(n: number) { return Math.round(n); }
      function pct(n: number)   { return Math.round(n * 10) / 10; }

      // ─── Sheet 1: Estado de Resultados ──────────────────────────────────────
      const ws1 = wb.addWorksheet('Estado de Resultados');
      ws1.columns = [
        { key: 'a', width: 38 },
        { key: 'b', width: 4 },
        { key: 'c', width: 22 },
        { key: 'd', width: 14 },
      ];

      function addPLRow(ws: ExcelJS.Worksheet, label: string, value: number | null, level: 0 | 1 | 2 | 3, color?: string) {
        const r = ws.addRow([label, '', value !== null ? money(value) : '', value !== null && netRevenue > 0 ? pct((value / netRevenue) * 100) + '%' : '']);
        r.getCell(1).font = { bold: level === 0 || level === 3, size: level === 3 ? 12 : 11, color: { argb: color || DARK } };
        r.getCell(1).alignment = { indent: level === 2 ? 3 : level === 1 ? 1 : 0 };
        if (value !== null) {
          r.getCell(3).numFmt = '#,##0';
          r.getCell(3).font = { bold: level === 0 || level === 3, size: level === 3 ? 12 : 11, color: { argb: color || DARK } };
          r.getCell(3).alignment = { horizontal: 'right' };
          r.getCell(4).font = { size: 10, color: { argb: color || 'FF64748B' } };
          r.getCell(4).alignment = { horizontal: 'right' };
        }
        if (level === 3) {
          r.eachCell((c) => {
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color === RED ? 'FFFEF2F2' : color === GREEN ? 'FFF0FDF4' : LGRAY } };
          });
        }
        r.height = level === 3 ? 22 : 18;
        return r;
      }

      // Title block
      const titleRow = ws1.addRow([`Estado de Resultados`]);
      titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: WHITE } };
      titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      titleRow.height = 30;
      ws1.mergeCells(`A${titleRow.number}:D${titleRow.number}`);

      const periodoRow = ws1.addRow([`Período: ${fmtDate(start)} — ${fmtDate(end)}`]);
      periodoRow.getCell(1).font = { italic: true, size: 11, color: { argb: 'FF475569' } };
      periodoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
      ws1.mergeCells(`A${periodoRow.number}:D${periodoRow.number}`);
      ws1.addRow([]);

      // Headers
      const hdr = ws1.addRow(['Concepto', '', 'Valor ($)', '% Ingresos']);
      hdr.eachCell((c, i) => {
        if (i === 1 || i === 3 || i === 4) {
          c.font = { bold: true, color: { argb: WHITE }, size: 10 };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
          c.alignment = { horizontal: i === 1 ? 'left' : 'right', vertical: 'middle' };
        }
      });
      ws1.mergeCells(`A${hdr.number}:B${hdr.number}`);
      ws1.addRow([]);

      addPLRow(ws1, '── INGRESOS', null, 0);
      addPLRow(ws1, 'Ventas brutas', grossRevenue, 2);
      addPLRow(ws1, '(-) Descuentos otorgados', -totalDiscounts, 2, AMBER);
      addPLRow(ws1, 'INGRESOS NETOS', netRevenue, 3, BLUE);
      ws1.addRow([]);

      addPLRow(ws1, '── COSTO DE VENTAS', null, 0);
      addPLRow(ws1, 'Costo de productos vendidos', totalCOGS, 2, RED);
      addPLRow(ws1, 'UTILIDAD BRUTA', grossProfit, 3, grossProfit >= 0 ? GREEN : RED);
      const marginNote = ws1.addRow([`   Margen bruto: ${pct(grossMarginPct)}%`]);
      marginNote.getCell(1).font = { italic: true, size: 10, color: { argb: '6B7280' } };
      ws1.addRow([]);

      addPLRow(ws1, '── GASTOS OPERATIVOS', null, 0);
      for (const [cat, amt] of [...expByCat.entries()].sort((a, b) => b[1] - a[1])) {
        addPLRow(ws1, cat, amt, 2);
      }
      addPLRow(ws1, 'TOTAL GASTOS', totalExpenses, 3, RED);
      ws1.addRow([]);

      addPLRow(ws1, 'UTILIDAD OPERATIVA / NETA', operatingProfit, 3, operatingProfit >= 0 ? GREEN : RED);
      ws1.addRow([]);

      // Quick stats block
      const statsTitle = ws1.addRow(['Datos adicionales del período']);
      statsTitle.getCell(1).font = { bold: true, size: 11, color: { argb: WHITE } };
      statsTitle.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK } };
      ws1.mergeCells(`A${statsTitle.number}:D${statsTitle.number}`);

      const stats = [
        [`Ventas completadas`, completedSales.length],
        [`Ventas anuladas`, Number(cancelledSales._count.id)],
        [`Compras del período`, Number(purchases._count.id)],
        [`Valor compras`, money(Number(purchases._sum.total || 0))],
        [`IVA recaudado`, money(totalTax)],
        [`Valor inventario actual (costo)`, money(inventoryValue)],
        [`Clientes con deuda pendiente`, receivables.length],
        [`Total cuentas por cobrar`, money(receivables.reduce((s, r) => s + Number(r.currentDebt), 0))],
      ];
      for (const [label, val] of stats) {
        const r = ws1.addRow([label, '', val]);
        r.getCell(1).alignment = { indent: 1 };
        r.getCell(3).numFmt = '#,##0';
        r.getCell(3).alignment = { horizontal: 'right' };
        r.getCell(3).font = { bold: true };
      }

      // ─── Sheet 2: Ventas por día ─────────────────────────────────────────────
      const ws2 = wb.addWorksheet('Ventas por día');
      ws2.columns = [
        { header: 'Fecha', key: 'date', width: 14 },
        { header: 'Transacciones', key: 'count', width: 16 },
        { header: 'Ingresos ($)', key: 'revenue', width: 18 },
        { header: 'Descuentos ($)', key: 'discounts', width: 16 },
        { header: 'COGS ($)', key: 'cogs', width: 16 },
        { header: 'Util. Bruta ($)', key: 'gross', width: 18 },
        { header: 'Margen %', key: 'margin', width: 12 },
      ];
      ws2.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
        c.alignment = { horizontal: 'center' };
      });
      for (const [day, v] of [...dailyMap.entries()].sort()) {
        const gross = v.revenue - v.cogs;
        const margin = v.revenue > 0 ? pct((gross / v.revenue) * 100) : 0;
        ws2.addRow({
          date: day, count: v.count, revenue: money(v.revenue),
          discounts: money(v.discounts), cogs: money(v.cogs),
          gross: money(gross), margin: margin + '%',
        });
      }
      // Total row
      const d2total = ws2.addRow({
        date: 'TOTAL', count: completedSales.length,
        revenue: money(grossRevenue), discounts: money(totalDiscounts),
        cogs: money(totalCOGS), gross: money(grossProfit),
        margin: pct(grossMarginPct) + '%',
      });
      d2total.font = { bold: true };
      d2total.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LGRAY } }; });
      for (const col of ['revenue', 'discounts', 'cogs', 'gross']) ws2.getColumn(col).numFmt = '#,##0';

      // ─── Sheet 3: Top productos ──────────────────────────────────────────────
      const ws3 = wb.addWorksheet('Top productos');
      ws3.columns = [
        { header: 'Producto', key: 'name', width: 32 },
        { header: 'Código', key: 'code', width: 14 },
        { header: 'Und. vendidas', key: 'qty', width: 15 },
        { header: 'Ingresos ($)', key: 'revenue', width: 18 },
        { header: 'COGS ($)', key: 'cogs', width: 16 },
        { header: 'Utilidad ($)', key: 'profit', width: 16 },
        { header: 'Margen %', key: 'margin', width: 12 },
      ];
      ws3.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
        c.alignment = { horizontal: 'center' };
      });
      for (const tp of topProducts) {
        const prod = nameById.get(tp.productId);
        const rev  = tp.revenue;
        const cogs = tp.cogs;
        const profit = rev - cogs;
        const margin = rev > 0 ? pct((profit / rev) * 100) : 0;
        ws3.addRow({
          name: prod?.name || tp.productId,
          code: prod?.code || '',
          qty: tp.qty,
          revenue: money(rev),
          cogs: money(cogs),
          profit: money(profit),
          margin: margin + '%',
        });
      }
      for (const col of ['revenue', 'cogs', 'profit']) ws3.getColumn(col).numFmt = '#,##0';

      // ─── Sheet 4: Gastos por categoría ───────────────────────────────────────
      const ws4 = wb.addWorksheet('Gastos por categoría');
      ws4.columns = [
        { header: 'Categoría', key: 'cat', width: 30 },
        { header: 'Total ($)', key: 'amount', width: 18 },
        { header: '% del total', key: 'pct', width: 14 },
      ];
      ws4.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
        c.alignment = { horizontal: 'center' };
      });
      for (const [cat, amt] of [...expByCat.entries()].sort((a, b) => b[1] - a[1])) {
        ws4.addRow({ cat, amount: money(amt), pct: totalExpenses > 0 ? pct((amt / totalExpenses) * 100) + '%' : '0%' });
      }
      const exp4total = ws4.addRow({ cat: 'TOTAL', amount: money(totalExpenses), pct: '100%' });
      exp4total.font = { bold: true };
      exp4total.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LGRAY } }; });
      ws4.getColumn('amount').numFmt = '#,##0';

      // ─── Sheet 5: Inventario valorizado ──────────────────────────────────────
      const ws5 = wb.addWorksheet('Inventario valorizado');
      ws5.columns = [
        { header: 'Producto', key: 'name', width: 32 },
        { header: 'Código', key: 'code', width: 14 },
        { header: 'Categoría', key: 'cat', width: 20 },
        { header: 'Stock', key: 'stock', width: 10 },
        { header: 'Costo Unit. ($)', key: 'cost', width: 18 },
        { header: 'Precio Venta ($)', key: 'price', width: 18 },
        { header: 'Valor Inventario ($)', key: 'value', width: 22 },
        { header: 'Margen potencial %', key: 'margin', width: 20 },
      ];
      ws5.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
        c.alignment = { horizontal: 'center' };
      });
      let totalInvValue = 0;
      for (const p of inventory) {
        const cost  = Number(p.costPrice);
        const price = Number(p.salePrice);
        const val   = cost * Number(p.stock);
        const margin = cost > 0 ? pct(((price - cost) / cost) * 100) : 0;
        totalInvValue += val;
        ws5.addRow({ name: p.name, code: p.code || '', cat: p.category?.name || '—', stock: Number(p.stock), cost: money(cost), price: money(price), value: money(val), margin: margin + '%' });
      }
      const inv5total = ws5.addRow({ name: `TOTAL (${inventory.length} productos)`, code: '', cat: '', stock: '', cost: '', price: '', value: money(totalInvValue), margin: '' });
      inv5total.font = { bold: true };
      inv5total.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LGRAY } }; });
      for (const col of ['cost', 'price', 'value']) ws5.getColumn(col).numFmt = '#,##0';

      // ─── Sheet 6: Cuentas por cobrar ─────────────────────────────────────────
      const ws6 = wb.addWorksheet('Cuentas por cobrar');
      ws6.columns = [
        { header: 'Cliente', key: 'name', width: 28 },
        { header: 'Documento', key: 'doc', width: 16 },
        { header: 'Deuda ($)', key: 'debt', width: 16 },
        { header: 'Límite crédito ($)', key: 'limit', width: 20 },
        { header: '% Cupo usado', key: 'pct', width: 16 },
      ];
      ws6.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: WHITE } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
        c.alignment = { horizontal: 'center' };
      });
      let totalDebt = 0;
      for (const r of receivables) {
        const debt  = Number(r.currentDebt);
        const limit = Number(r.creditLimit);
        const usedPct = limit > 0 ? pct((debt / limit) * 100) : null;
        totalDebt += debt;
        ws6.addRow({ name: r.name, doc: r.document || '—', debt: money(debt), limit: limit > 0 ? money(limit) : '—', pct: usedPct !== null ? usedPct + '%' : '—' });
      }
      if (receivables.length > 0) {
        const rec6total = ws6.addRow({ name: `TOTAL (${receivables.length} clientes)`, doc: '', debt: money(totalDebt), limit: '', pct: '' });
        rec6total.font = { bold: true };
        rec6total.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LGRAY } }; });
      }
      ws6.getColumn('debt').numFmt = '#,##0';

      // ── 4. Stream to client ───────────────────────────────────────────────────
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="estado-resultados-${start0}-${end0}.xlsx"`);
      await wb.xlsx.write(res);
      res.end();
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