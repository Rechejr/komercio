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

  /**
   * Ventas por medio de pago, en el rango pedido.
   *
   * Para qué sirve: un negocio que vende con Addi o Sistecrédito necesita saber
   * cuánto le tiene que girar cada plataforma, y eso no se ve en el reporte de
   * ventas normal. Lo mismo con los bancos: qué entró por transferencia y qué
   * por datáfono.
   *
   * Ojo con las ventas MIXTAS: ahí `paymentAccountId` queda null y el desglose
   * vive en `paymentDetails.splits`. Si solo se contaran las de un solo medio,
   * el reporte no cuadraría con el total vendido, así que los splits se reparten
   * y se suman a la cuenta que les corresponde.
   */
  async paymentMethodsReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate } = req.query;
      const businessId = req.user!.businessId!;
      const { start, end, startStr, endStr } = resolveRange(startDate, endDate);

      const cacheKey = `report:medios:${businessId}:${startStr}:${endStr}`;
      const cached = await cache.get<object>(cacheKey);
      if (cached) return success(res, cached);

      const [cuentas, porCuenta, mixtas, totalVendido] = await Promise.all([
        // Todas las cuentas del negocio, incluso las que no vendieron nada en el
        // rango: ver "Addi: $0 este mes" también es información.
        prisma.paymentAccount.findMany({
          where: { businessId },
          select: { id: true, name: true, type: true, active: true, legacyEnum: true, order: true },
          orderBy: { order: 'asc' },
        }),

        // Ventas de un solo medio.
        prisma.$queryRaw<Array<{ account_id: string; total: number; count: number }>>`
          SELECT s."paymentAccountId" AS account_id,
                 SUM(s.total)::float  AS total,
                 COUNT(*)::int        AS count
            FROM sales s
            JOIN branches br ON s."branchId" = br.id
           WHERE s."createdAt" BETWEEN ${start} AND ${end}
             AND s.status = 'COMPLETED'
             AND s."deletedAt" IS NULL
             AND br."businessId" = ${businessId}
             AND s."paymentAccountId" IS NOT NULL
           GROUP BY s."paymentAccountId"
        `,

        // Ventas mixtas: se abre el desglose y se suma cada parte por su método.
        //
        // El vuelto se descuenta de la parte en efectivo, igual que hace la caja
        // (computeCashAmount en sale.controller): si el cliente paga $50.000 en
        // efectivo y $12.000 con tarjeta por una compra de $60.000, esos $2.000
        // de cambio volvieron a su bolsillo y no son venta. Sin descontarlos el
        // reporte no cuadraba con el total vendido.
        prisma.$queryRaw<Array<{ metodo: string; total: number; count: number }>>`
          SELECT metodo,
                 SUM(monto)::float         AS total,
                 COUNT(DISTINCT venta)::int AS count
            FROM (
              SELECT s.id                AS venta,
                     parte->>'method'    AS metodo,
                     GREATEST(0, SUM((parte->>'amount')::numeric)
                       - CASE WHEN parte->>'method' = 'CASH'
                              THEN MAX(s."changeAmount") ELSE 0 END) AS monto
                FROM sales s
                JOIN branches br ON s."branchId" = br.id,
                     jsonb_array_elements(s."paymentDetails"->'splits') AS parte
               WHERE s."createdAt" BETWEEN ${start} AND ${end}
                 AND s.status = 'COMPLETED'
                 AND s."deletedAt" IS NULL
                 AND br."businessId" = ${businessId}
                 AND s."paymentMethod" = 'MIXED'
                 AND s."paymentDetails" IS NOT NULL
               GROUP BY s.id, parte->>'method'
            ) partes
           GROUP BY metodo
        `,

        prisma.sale.aggregate({
          where: {
            createdAt: { gte: start, lte: end },
            status: 'COMPLETED', deletedAt: null,
            branch: { businessId },
          },
          _sum: { total: true },
          _count: { id: true },
        }),
      ]);

      // Se arranca con todas las cuentas en cero y se les va sumando.
      const acumulado = new Map<string, { id: string; name: string; type: string; active: boolean; total: number; count: number }>();
      for (const c of cuentas) {
        acumulado.set(c.id, { id: c.id, name: c.name, type: c.type, active: c.active, total: 0, count: 0 });
      }

      for (const fila of porCuenta) {
        const item = acumulado.get(fila.account_id);
        if (item) { item.total += Number(fila.total || 0); item.count += Number(fila.count || 0); }
      }

      // El desglose de las mixtas viene con el enum viejo (CASH, TRANSFER…), no
      // con el id de la cuenta: se empareja por `legacyEnum`.
      const porLegacy = new Map<string, string>();
      for (const c of cuentas) {
        if (c.legacyEnum && !porLegacy.has(c.legacyEnum)) porLegacy.set(c.legacyEnum, c.id);
      }
      let sinCuenta = 0;
      for (const fila of mixtas) {
        const cuentaId = porLegacy.get(fila.metodo);
        const item = cuentaId ? acumulado.get(cuentaId) : undefined;
        if (item) { item.total += Number(fila.total || 0); item.count += Number(fila.count || 0); }
        else sinCuenta += Number(fila.total || 0);
      }

      const medios = Array.from(acumulado.values());
      const sumaPor = (tipo: string) =>
        medios.filter((m) => m.type === tipo).reduce((a, m) => a + m.total, 0);

      const data = {
        period: { start, end },
        // Por tipo: es como el negocio piensa la plata ("cuánto en efectivo,
        // cuánto me giran las plataformas, cuánto está en bancos").
        porTipo: {
          efectivo: sumaPor('CASH'),
          bancos: sumaPor('BANK'),
          financiacion: sumaPor('FINANCING'),
          otros: sumaPor('OTHER'),
        },
        medios: medios.sort((a, b) => b.total - a.total),
        totals: {
          totalVendido: Number(totalVendido._sum.total || 0),
          ventas: totalVendido._count.id,
          // Lo que no se pudo atribuir a ningún medio (un método del desglose
          // que ya no tiene cuenta configurada). Si sale > 0, algo hay que mirar.
          sinAtribuir: sinCuenta,
        },
      };

      await cache.set(cacheKey, data, 300);
      return success(res, data);
    } catch (err) { next(err); }
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