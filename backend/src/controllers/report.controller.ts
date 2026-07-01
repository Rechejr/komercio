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
          TO_CHAR(s."createdAt", ${groupFormat}) AS period,
          SUM(s.total)::float            AS revenue,
          COUNT(*)::int                  AS count,
          SUM(s."taxAmount")::float      AS taxes,
          SUM(s."discountAmount")::float AS discounts
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

      return success(res, {
        period: { start, end },
        chart: sales.map((s: any) => ({
          period: s.period,
          revenue: Number(s.revenue ?? 0),
          count: Number(s.count ?? 0),
          taxes: Number(s.taxes ?? 0),
          discounts: Number(s.discounts ?? 0),
        })),
        totals: {
          revenue: totals._sum.total || 0,
          taxes: totals._sum.taxAmount || 0,
          discounts: totals._sum.discountAmount || 0,
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
        _sum: { quantity: true, total: true },
        orderBy: { _sum: { total: 'desc' } },
        take: parseInt(limit as string),
      });

      const productIds = top.map((t) => t.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, businessId },
        select: { id: true, name: true, code: true, category: { select: { name: true } } },
      });
      const productMap = new Map(products.map((p) => [p.id, p]));

      return success(res, top.map((t) => ({
        product: productMap.get(t.productId),
        totalQty: t._sum.quantity,
        totalRevenue: t._sum.total,
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
        take: parseInt(limit as string),
      });

      const customerIds = top.map((t) => t.customerId!);
      const customers = await prisma.customer.findMany({
        where: { id: { in: customerIds }, businessId },
        select: { id: true, name: true, phone: true },
      });
      const customerMap = new Map(customers.map((c) => [c.id, c]));

      return success(res, top.map((t) => ({
        customer: customerMap.get(t.customerId!),
        totalPurchases: t._sum.total,
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

      const revenue = revenueData._sum.total || 0;
      const cogs = Number(cogsResult[0]?.cogs || 0);
      const grossProfit = revenue - cogs;
      const expenses = expenseData._sum.amount || 0;
      const netProfit = grossProfit - expenses;

      return success(res, {
        period: { start, end },
        revenue,
        cogs,
        grossProfit,
        grossMargin: revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(2) : 0,
        expenses,
        netProfit,
        netMargin: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) : 0,
      });
    } catch (err) {
      next(err);
    }
  },
};