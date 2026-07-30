import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { success } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';
import { parseBogotaBoundary, bogotaDayStart, bogotaMonthStart } from '../utils/bogotaTime';

const REPORT_TTL = 300; // 5 min — suficiente frescura para analítica

/**
 * Rango del reporte en horario de Colombia. Los `startDate`/`endDate` que
 * manda la UI son días calendario ("2026-07-25"), y el usuario espera que
 * "del 25 al 29" cubra esos 5 días completos tal como los vive en su negocio
 * —no corridos 5 horas por el UTC del servidor.
 *
 * Por defecto: del primero del mes hasta hoy, también en Bogotá.
 */
function resolveRange(startDate: unknown, endDate: unknown): { start: Date; end: Date; startStr: string; endStr: string } {
  const now = new Date();
  const start = parseBogotaBoundary(startDate, 'start') ?? bogotaMonthStart(now);
  const end = parseBogotaBoundary(endDate, 'end') ?? new Date(bogotaDayStart(now, 1).getTime() - 1);
  // Las claves de cache se derivan del rango ya resuelto: dos formatos
  // distintos que apuntan al mismo instante comparten entrada.
  return { start, end, startStr: start.toISOString(), endStr: end.toISOString() };
}

export const reportController = {
  async salesReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;
      const businessId = req.user!.businessId!;

      const { start, end, startStr, endStr } = resolveRange(startDate, endDate);
      const cacheKey = `report:sales:${businessId}:${startStr}:${endStr}:${groupBy}`;

      const cached = await cache.get<object>(cacheKey);
      if (cached) return success(res, cached);

      let groupFormat = 'YYYY-MM-DD';
      if (groupBy === 'week') groupFormat = 'YYYY-WW';
      if (groupBy === 'month') groupFormat = 'YYYY-MM';

      const [sales, totals] = await Promise.all([
        prisma.$queryRaw<Array<any>>`
          SELECT
            -- Se agrupa por el día calendario COLOMBIANO. La columna es
            -- 'timestamp without time zone' en UTC, así que primero se ancla a
            -- UTC y luego se convierte. Sin esto una venta de las 8 p.m. (01:00
            -- UTC del día siguiente) salía graficada un día después.
            TO_CHAR(s."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota', ${groupFormat}) AS period,
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
        `,
        prisma.sale.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
            status: 'COMPLETED',
            deletedAt: null,
            branch: { businessId },
          },
          _sum: { total: true, taxAmount: true, discountAmount: true },
          _count: { id: true },
        }),
      ]);

      const grossRevenue = Number(totals._sum.total || 0);
      const taxCollected = Number(totals._sum.taxAmount || 0);

      const data = {
        period: { start, end },
        chart: sales.map((s: any) => ({
          period: s.period,
          grossRevenue: Number(s.gross_revenue ?? 0),
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
      };

      await cache.set(cacheKey, data, REPORT_TTL);
      return success(res, data);
    } catch (err) {
      next(err);
    }
  },

  async topProducts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, limit = '10' } = req.query;
      const businessId = req.user!.businessId!;

      const { start, end, startStr, endStr } = resolveRange(startDate, endDate);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 10));
      const cacheKey = `report:top-products:${businessId}:${startStr}:${endStr}:${limitNum}`;

      const cached = await cache.get<object[]>(cacheKey);
      if (cached) return success(res, cached);

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
        _sum: { quantity: true, subtotal: true, total: true },
        orderBy: { _sum: { subtotal: 'desc' } },
        take: limitNum,
      });

      const productIds = top.map((t) => t.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, businessId },
        select: { id: true, name: true, code: true, category: { select: { name: true } } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      const data = top.map((t) => ({
        product: productMap.get(t.productId),
        totalQty: Number(t._sum.quantity ?? 0),
        totalRevenue: Number(t._sum.subtotal ?? 0),
        totalGross: Number(t._sum.total ?? 0),
      }));

      await cache.set(cacheKey, data, REPORT_TTL);
      return success(res, data);
    } catch (err) {
      next(err);
    }
  },

  async topCustomers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, limit = '10' } = req.query;
      const businessId = req.user!.businessId!;

      const { start, end, startStr, endStr } = resolveRange(startDate, endDate);
      const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 10));
      const cacheKey = `report:top-customers:${businessId}:${startStr}:${endStr}:${limitNum}`;

      const cached = await cache.get<object[]>(cacheKey);
      if (cached) return success(res, cached);

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
        take: limitNum,
      });

      const customerIds = top.map((t) => t.customerId!);
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds }, businessId },
        select: { id: true, name: true, phone: true },
      });
      const customerMap = new Map(customers.map((c) => [c.id, c]));

      const data = top.map((t) => ({
        customer: customerMap.get(t.customerId!),
        totalPurchases: Number(t._sum.total ?? 0),
        visitCount: t._count.id,
      }));

      await cache.set(cacheKey, data, REPORT_TTL);
      return success(res, data);
    } catch (err) {
      next(err);
    }
  },

  async profitReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const businessId = req.user!.businessId!;

      const { start, end, startStr, endStr } = resolveRange(startDate, endDate);
      const cacheKey = `report:profit:${businessId}:${startStr}:${endStr}`;

      const cached = await cache.get<object>(cacheKey);
      if (cached) return success(res, cached);

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
      const grossRevenue = Number(revenueData._sum.total || 0);
      const taxCollected = Number(revenueData._sum.taxAmount || 0);
      const discountsGiven = Number(revenueData._sum.discountAmount || 0);
      const revenue = grossRevenue - taxCollected;
      const cogs = Number(cogsResult[0]?.cogs || 0);
      const grossProfit = revenue - cogs;
      const expenses = Number(expenseData._sum.amount || 0);
      const netProfit = grossProfit - expenses;

      const data = {
        period: { start, end },
        grossRevenue,
        taxCollected,
        discountsGiven,
        revenue,
        cogs,
        grossProfit,
        grossMargin: revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(2)) : 0,
        expenses,
        netProfit,
        netMargin: revenue > 0 ? Number(((netProfit / revenue) * 100).toFixed(2)) : 0,
      };

      await cache.set(cacheKey, data, REPORT_TTL);
      return success(res, data);
    } catch (err) {
      next(err);
    }
  },
};