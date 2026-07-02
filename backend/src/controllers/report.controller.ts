import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { success } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';

export const reportController = {
  async salesReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;
      const businessId = req.user!.businessId!;

      const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1));
      const end = endDate ? new Date(endDate as string) : new Date();

      let groupFormat = 'YYYY-MM-DD';
      if (groupBy === 'week') groupFormat = 'YYYY-WW';
      if (groupBy === 'month') groupFormat = 'YYYY-MM';

      const sales = await prisma.$queryRaw<Array<any>>`
        SELECT
          TO_CHAR(s."createdAt", ${groupFormat})          AS period,
          SUM(s.total)::float                             AS gross_revenue,
          SUM(s.total - s."taxAmount")::float             AS net_revenue,
          COUNT(*)::int                                   AS count,
          SUM(s."taxAmount")::float                       AS taxes,
          SUM(s."discountAmount")::float                  AS discounts
        FROM sales s
        JOIN branches br ON s."branchId" = br.id
        WHERE s."createdAt" BETWEEN ${start} AND ${end}
          AND s.status = 'COMPLETED'
          AND s."deletedAt" IS NULL
          AND br."businessId" = ${businessId}
        GROUP BY period
        ORDER BY period ASC
      `;

      const totals = await prisma.sale.aggregate({
        where: {
          createdAt: { gte: start, lte: end },
          status: 'COMPLETED',
          deletedAt: null,
          branch: { businessId },
        },
        _sum: { total: true, taxAmount: true, discountAmount: true },
        _count: { id: true },
      });

      const grossRevenue = Number(totals._sum.total || 0);
      const taxCollected = Number(totals._sum.taxAmount || 0);

      return success(res, {
        period: { start, end },
        chart: sales.map((s: any) => ({
          period: s.period,
          grossRevenue: Number(s.gross_revenue ?? 0),
          // net_revenue = total − IVA = ingresos reales del negocio (sin IVA)
          netRevenue: Number(s.net_revenue ?? 0),
          count: Number(s.count ?? 0),
          taxes: Number(s.taxes ?? 0),
          discounts: Number(s.discounts ?? 0),
        })),
        totals: {
          grossRevenue,
          taxCollected,
          netRevenue: grossRevenue - taxCollected,
          discounts: Number(totals._sum.discountAmount || 0),
          count: totals._count.id,
        },
      });
    } catch (err) {
      next(err);
    }
  },

  async topProducts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, limit = '10' } = req.query;
      const businessId = req.user!.businessId!;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1));
      const end = endDate ? new Date(endDate as string) : new Date();

      const top = await prisma.saleDetail.groupBy({
        by: ['productId'],
        where: {
          sale: {
            createdAt: { gte: start, lte: end },
            status: 'COMPLETED',
            deletedAt: null,
            branch: { businessId },
          },
        },
        // subtotal = ingresos netos ex-IVA por línea; total incluye IVA (no es ingreso del negocio)
        _sum: { quantity: true, subtotal: true, total: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: Math.min(50, Math.max(1, parseInt(limit as string) || 10)),
      });

      const productIds = top.map((t) => t.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, businessId },
        select: { id: true, name: true, code: true, category: { select: { name: true } } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      return success(res, top.map((t) => ({
        product: productMap.get(t.productId),
        totalQty: Number(t._sum.quantity ?? 0),
        totalRevenue: Number(t._sum.subtotal ?? 0),
        totalGross: Number(t._sum.total ?? 0),
      })));
    } catch (err) {
      next(err);
    }
  },

  async topCustomers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, limit = '10' } = req.query;
      const businessId = req.user!.businessId!;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1));
      const end = endDate ? new Date(endDate as string) : new Date();

      const top = await prisma.sale.groupBy({
        by: ['customerId'],
        where: {
          createdAt: { gte: start, lte: end },
          status: 'COMPLETED',
          deletedAt: null,
          customerId: { not: null },
          branch: { businessId },
        },
        _sum: { total: true },
        _count: { id: true },
        orderBy: { _sum: { total: 'desc' } },
        take: Math.min(50, Math.max(1, parseInt(limit as string) || 10)),
      });

      const customerIds = top.map((t) => t.customerId!);
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds }, businessId },
        select: { id: true, name: true, phone: true },
      });
      const customerMap = new Map(customers.map((c) => [c.id, c]));

      return success(res, top.map((t) => ({
        customer: customerMap.get(t.customerId!),
        totalPurchases: Number(t._sum.total ?? 0),
        visitCount: t._count.id,
      })));
    } catch (err) {
      next(err);
    }
  },

  async profitReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const businessId = req.user!.businessId!;
      const start = startDate ? new Date(startDate as string) : new Date(new Date().setDate(1));
      const end = endDate ? new Date(endDate as string) : new Date();

      const [revenueData, expenseData, cogsResult] = await Promise.all([
        prisma.sale.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
            status: 'COMPLETED',
            deletedAt: null,
            branch: { businessId },
          },
          _sum: { total: true, taxAmount: true, discountAmount: true },
        }),
        prisma.expense.aggregate({
          where: { date: { gte: start, lte: end }, deletedAt: null, businessId },
          _sum: { amount: true },
        }),
        prisma.$queryRaw<[{ cogs: number }]>`
          SELECT COALESCE(SUM(sd."costPrice" * sd.quantity), 0)::float AS cogs
          FROM sale_details sd
          JOIN sales s ON sd."saleId" = s.id
          JOIN branches br ON s."branchId" = br.id
          WHERE s."createdAt" BETWEEN ${start} AND ${end}
            AND s.status = 'COMPLETED'
            AND s."deletedAt" IS NULL
            AND br."businessId" = ${businessId}
        `,
      ]);

      // IVA cobrado es un pasivo tributario, no ingreso del negocio.
      // revenue = total − IVA = subtotal − descuentoGlobal (ingresos netos reales).
      const grossRevenue = Number(revenueData._sum.total || 0);
      const taxCollected = Number(revenueData._sum.taxAmount || 0);
      const discountsGiven = Number(revenueData._sum.discountAmount || 0);
      const revenue = grossRevenue - taxCollected;        // ingresos netos ex-IVA

      // COGS = costPrice histórico × cantidad (snapshotted en sale_details al momento de la venta)
      const cogs = Number(cogsResult[0]?.cogs || 0);
      const grossProfit = revenue - cogs;
      const expenses = Number(expenseData._sum.amount || 0);
      const netProfit = grossProfit - expenses;

      return success(res, {
        period: { start, end },
        grossRevenue,                   // total facturado al cliente (incl. IVA)
        taxCollected,                   // IVA recaudado (pasivo DIAN, no ingreso)
        discountsGiven,                 // descuentos otorgados
        revenue,                        // ingresos netos ex-IVA
        cogs,                           // costo de mercancía vendida (costo histórico)
        grossProfit,
        grossMargin: revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(2)) : 0,
        expenses,                       // gastos operativos del período
        netProfit,
        netMargin: revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(2)) : 0,
      });
    } catch (err) {
      next(err);
    }
  },
};