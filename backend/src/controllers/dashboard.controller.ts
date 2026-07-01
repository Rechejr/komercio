import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { success } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';

export const dashboardController = {
  async getSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId!;
      const cacheKey = `dashboard:${businessId}`;

      const cached = await cache.get(cacheKey).catch(() => null);
      if (cached) return success(res, cached);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [summaryRaw, recentSales, topProducts] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT
            COALESCE(SUM(CASE WHEN s."createdAt" >= ${todayStart} AND s.status = 'COMPLETED' THEN s.total END), 0)   AS today_total,
            COALESCE(COUNT(CASE WHEN s."createdAt" >= ${todayStart} AND s.status = 'COMPLETED' THEN 1 END), 0)       AS today_count,
            COALESCE(SUM(CASE WHEN s."createdAt" >= ${weekStart}  AND s.status = 'COMPLETED' THEN s.total END), 0)   AS week_total,
            COALESCE(COUNT(CASE WHEN s."createdAt" >= ${weekStart}  AND s.status = 'COMPLETED' THEN 1 END), 0)       AS week_count,
            COALESCE(SUM(CASE WHEN s."createdAt" >= ${monthStart} AND s.status = 'COMPLETED' THEN s.total END), 0)   AS month_total,
            COALESCE(COUNT(CASE WHEN s."createdAt" >= ${monthStart} AND s.status = 'COMPLETED' THEN 1 END), 0)       AS month_count
          FROM sales s
          JOIN branches br ON s."branchId" = br.id
          WHERE br."businessId" = ${businessId}
            AND s."deletedAt" IS NULL
        `,

        prisma.$queryRaw<any[]>`
          SELECT s.id, s."invoiceNumber", s.total, s.status, s."createdAt",
                 c.name AS customer_name, u.name AS user_name
          FROM sales s
          JOIN branches br ON s."branchId" = br.id
          LEFT JOIN customers c ON s."customerId" = c.id
          LEFT JOIN users u ON s."userId" = u.id
          WHERE s."deletedAt" IS NULL
            AND br."businessId" = ${businessId}
          ORDER BY s."createdAt" DESC
          LIMIT 5
        `,

        prisma.$queryRaw<any[]>`
          SELECT p.name, p.code, SUM(sd.quantity) AS total_qty
          FROM sale_details sd
          JOIN products p ON sd."productId" = p.id
          JOIN sales s ON sd."saleId" = s.id
          JOIN branches br ON s."branchId" = br.id
          WHERE s."createdAt" >= ${monthStart}
            AND s.status = 'COMPLETED'
            AND s."deletedAt" IS NULL
            AND br."businessId" = ${businessId}
          GROUP BY p.id, p.name, p.code
          ORDER BY total_qty DESC
          LIMIT 5
        `,
      ]);

      const [totalProducts, lowStockRaw, totalCustomers, customersWithDebt, pendingCredits] =
        await Promise.all([
          prisma.product.count({ where: { deletedAt: null, isActive: true, businessId } }),
          prisma.$queryRaw<[{ c: bigint }]>`
            SELECT COUNT(*)::int AS c FROM products
            WHERE stock <= "minStock"
              AND "deletedAt" IS NULL
              AND "isActive" = true
              AND "businessId" = ${businessId}
          `,
          prisma.customer.count({ where: { deletedAt: null, isActive: true, businessId } }),
          prisma.customer.count({ where: { currentDebt: { gt: 0 }, businessId } }),
          prisma.credit.aggregate({
            where: {
              status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
              customer: { businessId },
            },
            _sum: { balance: true },
            _count: { id: true },
          }),
        ]);
      const lowStock = Number(lowStockRaw[0]?.c || 0);

      const sr = summaryRaw[0] || {};
      const data = {
        sales: {
          today: { total: Number(sr.today_total || 0), count: Number(sr.today_count || 0) },
          week:  { total: Number(sr.week_total || 0),  count: Number(sr.week_count || 0) },
          month: { total: Number(sr.month_total || 0), count: Number(sr.month_count || 0) },
        },
        inventory: { totalProducts, lowStock },
        customers: { total: totalCustomers, withDebt: customersWithDebt },
        credits: {
          totalBalance: pendingCredits._sum.balance || 0,
          count: pendingCredits._count.id,
        },
        recentSales: recentSales.map((s: any) => ({
          id: s.id,
          invoiceNumber: s.invoiceNumber ?? s.invoicenumber,
          total: Number(s.total),
          status: s.status,
          createdAt: s.createdAt ?? s.createdat,
          customer: s.customer_name ? { name: s.customer_name } : null,
          user: { name: s.user_name },
        })),
        topProducts: topProducts.map((p: any) => ({
          product: { name: p.name, code: p.code },
          _sum: { quantity: Number(p.total_qty) },
        })),
      };

      await cache.set(cacheKey, data, 120).catch(() => {});
      return success(res, data);
    } catch (err) {
      next(err);
    }
  },

  async getSalesChart(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { period = '30d' } = req.query;
      const businessId = req.user!.businessId!;
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const cacheKey = `chart:${businessId}:${period}`;
      const cached = await cache.get(cacheKey).catch(() => null);
      if (cached) return success(res, cached);

      const sales = await prisma.$queryRaw<Array<{ date: string; total: number; count: bigint }>>`
        SELECT
          TO_CHAR(s."createdAt", 'YYYY-MM-DD') AS date,
          SUM(s.total)::float AS total,
          COUNT(*)::int       AS count
        FROM sales s
        JOIN branches br ON s."branchId" = br.id
        WHERE s."createdAt" >= ${startDate}
          AND s.status = 'COMPLETED'
          AND s."deletedAt" IS NULL
          AND br."businessId" = ${businessId}
        GROUP BY date
        ORDER BY date ASC
      `;

      const result = sales.map((s) => ({ ...s, count: Number(s.count), total: Number(s.total) }));
      await cache.set(cacheKey, result, 300).catch(() => {});
      return success(res, result);
    } catch (err) {
      next(err);
    }
  },
};
