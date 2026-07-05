import { Response, NextFunction } from 'express';
import { reportController } from '../../controllers/report.controller';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { AuthRequest } from '../../middlewares/auth';

jest.mock('../../config/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    sale: {
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    saleDetail: { groupBy: jest.fn() },
    product: { findMany: jest.fn() },
    customer: { findMany: jest.fn() },
    expense: { aggregate: jest.fn() },
  },
}));

jest.mock('../../config/redis', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCache = cache as jest.Mocked<typeof cache>;

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'a@b.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'br-1' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as AuthRequest;
}

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json, status };
}

const next = jest.fn() as unknown as NextFunction;

// ─── salesReport ─────────────────────────────────────────────────────────────

describe('reportController.salesReport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna datos cacheados cuando el cache tiene el reporte', async () => {
    const cached = { totals: { grossRevenue: 500000 } };
    mockCache.get.mockResolvedValue(cached as any);

    const { res, json } = makeRes();
    await reportController.salesReport(makeReq({ query: { startDate: '2026-07-01', endDate: '2026-07-05' } }), res, next);

    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: cached }));
  });

  it('consulta la base de datos y cachea cuando no hay cache', async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('OK' as any);

    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([
      { period: '2026-07-01', gross_revenue: '200000', net_revenue: '180000', count: '5', taxes: '20000', discounts: '0' },
    ]);
    (mockPrisma.sale.aggregate as jest.Mock).mockResolvedValue({
      _sum: { total: 200000, taxAmount: 20000, discountAmount: 0 },
      _count: { id: 5 },
    });

    const { res, json } = makeRes();
    await reportController.salesReport(
      makeReq({ query: { startDate: '2026-07-01', endDate: '2026-07-05', groupBy: 'day' } }),
      res,
      next,
    );

    expect(mockCache.set).toHaveBeenCalledWith(
      expect.stringContaining('report:sales:biz-1'),
      expect.any(Object),
      300,
    );
    const data = (json.mock.calls[0][0] as any).data;
    expect(data.totals.grossRevenue).toBe(200000);
    expect(data.chart).toHaveLength(1);
  });
});

// ─── topProducts ──────────────────────────────────────────────────────────────

describe('reportController.topProducts', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna datos cacheados', async () => {
    const cached = [{ product: { name: 'Coca-Cola' }, totalQty: 50 }];
    mockCache.get.mockResolvedValue(cached as any);

    const { res, json } = makeRes();
    await reportController.topProducts(makeReq(), res, next);

    expect(mockPrisma.saleDetail.groupBy).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: cached }));
  });

  it('consulta y cachea el top de productos', async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('OK' as any);

    (mockPrisma.saleDetail.groupBy as jest.Mock).mockResolvedValue([
      { productId: 'p1', _sum: { quantity: 100, subtotal: 200000, total: 220000 } },
    ]);
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([
      { id: 'p1', name: 'Coca-Cola', code: 'P1', category: { name: 'Bebidas' } },
    ]);

    const { res, json } = makeRes();
    await reportController.topProducts(makeReq({ query: { limit: '5' } }), res, next);

    expect(mockPrisma.saleDetail.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 })
    );
    const data = (json.mock.calls[0][0] as any).data;
    expect(data[0].product.name).toBe('Coca-Cola');
    expect(data[0].totalQty).toBe(100);
  });

  it('limita el parámetro limit a 50 como máximo', async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('OK' as any);
    (mockPrisma.saleDetail.groupBy as jest.Mock).mockResolvedValue([]);
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([]);

    await reportController.topProducts(makeReq({ query: { limit: '999' } }), makeRes().res, next);

    expect(mockPrisma.saleDetail.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ take: 50 })
    );
  });
});

// ─── topCustomers ─────────────────────────────────────────────────────────────

describe('reportController.topCustomers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna datos cacheados', async () => {
    const cached = [{ customer: { name: 'Juan' }, totalPurchases: 300000 }];
    mockCache.get.mockResolvedValue(cached as any);

    const { res, json } = makeRes();
    await reportController.topCustomers(makeReq(), res, next);

    expect(mockPrisma.sale.groupBy).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: cached }));
  });

  it('consulta y cachea el top de clientes', async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('OK' as any);

    (mockPrisma.sale.groupBy as jest.Mock).mockResolvedValue([
      { customerId: 'c1', _sum: { total: 500000 }, _count: { id: 8 } },
    ]);
    (mockPrisma.customer.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', name: 'María López', phone: '3001234567' },
    ]);

    const { res, json } = makeRes();
    await reportController.topCustomers(makeReq(), res, next);

    const data = (json.mock.calls[0][0] as any).data;
    expect(data[0].customer.name).toBe('María López');
    expect(data[0].totalPurchases).toBe(500000);
    expect(data[0].visitCount).toBe(8);
  });
});

// ─── profitReport ─────────────────────────────────────────────────────────────

describe('reportController.profitReport', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna datos cacheados', async () => {
    const cached = { netProfit: 150000 };
    mockCache.get.mockResolvedValue(cached as any);

    const { res, json } = makeRes();
    await reportController.profitReport(makeReq(), res, next);

    expect(mockPrisma.sale.aggregate).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: cached }));
  });

  it('calcula correctamente el margen neto y bruto', async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('OK' as any);

    // Revenue: 1,000,000 total, 100,000 IVA → net revenue = 900,000
    // COGS: 600,000 → gross profit = 300,000
    // Expenses: 100,000 → net profit = 200,000
    (mockPrisma.sale.aggregate as jest.Mock).mockResolvedValue({
      _sum: { total: 1000000, taxAmount: 100000, discountAmount: 0 },
    });
    (mockPrisma.expense.aggregate as jest.Mock).mockResolvedValue({
      _sum: { amount: 100000 },
    });
    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue([{ cogs: 600000 }]);

    const { res, json } = makeRes();
    await reportController.profitReport(makeReq({ query: { startDate: '2026-07-01', endDate: '2026-07-05' } }), res, next);

    const data = (json.mock.calls[0][0] as any).data;
    expect(data.grossRevenue).toBe(1000000);
    expect(data.revenue).toBe(900000);
    expect(data.cogs).toBe(600000);
    expect(data.grossProfit).toBe(300000);
    expect(data.expenses).toBe(100000);
    expect(data.netProfit).toBe(200000);
    expect(data.grossMargin).toBeCloseTo(33.33, 1);
    expect(data.netMargin).toBeCloseTo(22.22, 1);
  });
});