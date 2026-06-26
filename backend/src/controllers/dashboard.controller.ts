import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { success } from '../utils/response';
import { AuthRequest } from '../middlewares/auth';

export const dashboardController = {
  async getSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const cacheKey = `dashboard:${req.user?.branchId || req.user?.businessId || 'global'}`;

      // Cache de 2 minutos — evita recalcular en cada clic
      const cached = await cache.get(cacheKey).catch(() => null);
      if (cached) return success(res, cached);

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - 7);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      // Una sola query raw que calcula todo en la BD → un solo viaje a Neon
      const [summaryRaw, recentSales, topProducts] = await Promise.all([
        prisma.$queryRaw<any[]>`
          SELECT
            -- Ventas hoy
            COALESCE(SUM(CASE WHEN "createdAt" >= ${todayStart} AND status = 'COMPLETED' THEN total END), 0)        AS today_total,
            COALESCE(COUNT(CASE WHEN "createdAt" >= ${todayStart} AND status = 'COMPLETED' THEN 1 END), 0)          AS today_count,
            -- Ventas semana
            COALESCE(SUM(CASE WHEN "createdAt" >= ${weekStart} AND status = 'COMPLETED' THEN total END), 0)         AS week_total,
            COALESCE(COUNT(CASE WHEN "createdAt" >= ${weekStart} AND status = 'COMPLETED' THEN 1 END), 0)           AS week_count,
            -- Ventas mes
            COALESCE(SUM(CASE WHEN "createdAt" >= ${monthStart} AND status = 'COMPLETED' THEN total END), 0)        AS month_total,
            COALESCE(COUNT(CASE WHEN "createdAt" >= ${monthStart} AND status = 'COMPLETED' THEN 1 END), 0)          AS month_count
          FROM sales
          WHERE "deletedAt" IS NULL
        `,

        // Últimas 5 ventas con join mínimo
        prisma.$queryRaw<any[]>`
          SELECT s.id, s."invoiceNumber", s.total, s.status, s."createdAt",
                 c.name AS customer_name, u.name AS user_name
          FROM sales s
          LEFT JOIN customers c ON s."customerId" = c.id
          LEFT JOIN users u ON s."userId" = u.id
          WHERE s."deletedAt" IS NULL
          ORDER BY s."createdAt" DESC
          LIMIT 5
        `,

        // Top 5 productos del mes con nombre
        prisma.$queryRaw<any[]>`
          SELECT p.name, p.code, SUM(sd.quantity) AS total_qty
          FROM sale_details sd
          JOIN products p ON sd."productId" = p.id
          JOIN sales s ON sd."saleId" = s.id
          WHERE s."createdAt" >= ${monthStart}
            AND s.status = 'COMPLETED'
            AND s."deletedAt" IS NULL
          GROUP BY p.id, p.name, p.code
          ORDER BY total_qty DESC
          LIMIT 5
        `,
      ]);

      const [totalProducts, lowStockRaw, totalCustomers, customersWithDebt, pendingCredits] =
        await Promise.all([
          prisma.product.count({ where: { deletedAt: null, isActive: true } }),
          prisma.$queryRaw<[{ c: bigint }]>`
            SELECT COUNT(*)::int AS c FROM products
            WHERE stock <= "minStock" AND "deletedAt" IS NULL AND "isActive" = true
          `,
          prisma.customer.count({ where: { deletedAt: null, isActive: true } }),
          prisma.customer.count({ where: { currentDebt: { gt: 0 } } }),
          prisma.credit.aggregate({
            where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
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
        inventory: {
          totalProducts,
          lowStock,
        },
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

      // Guarda 2 minutos en cache (si Redis está disponible)
      await cache.set(cacheKey, data, 120).catch(() => {});

      return success(res, data);
    } catch (err) {
      next(err);
    }
  },

  async getSalesChart(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { period = '30d' } = req.query;
      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const cacheKey = `chart:${req.user?.businessId || 'global'}:${period}`;
      const cached = await cache.get(cacheKey).catch(() => null);
      if (cached) return success(res, cached);

      const sales = await prisma.$queryRaw<Array<{ date: string; total: number; count: bigint }>>`
        SELECT
          DATE("createdAt") AS date,
          SUM(total)::float  AS total,
          COUNT(*)::int      AS count
        FROM sales
        WHERE "createdAt" >= ${startDate}
          AND status = 'COMPLETED'
          AND "deletedAt" IS NULL
        GROUP BY DATE("createdAt")
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
