import { Response, NextFunction } from 'express';
import { dashboardController } from '../../controllers/dashboard.controller';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { AuthRequest } from '../../middlewares/auth';

jest.mock('../../config/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    product: { count: jest.fn() },
    customer: { count: jest.fn() },
    credit: { aggregate: jest.fn() },
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

// ─── getSummary ───────────────────────────────────────────────────────────────

describe('dashboardController.getSummary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna datos cacheados si el cache tiene el resumen', async () => {
    const cached = { sales: { today: { total: 100000, count: 5 } } };
    mockCache.get.mockResolvedValue(cached as any);

    const { res, json } = makeRes();
    await dashboardController.getSummary(makeReq(), res, next);

    expect(mockCache.get).toHaveBeenCalledWith('dashboard:biz-1');
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: cached }));
  });

  it('consulta la base de datos y cachea el resultado cuando no hay cache', async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('OK' as any);

    const summaryRow = [{ today_total: '80000', today_count: '3', week_total: '400000', week_count: '15', month_total: '1200000', month_count: '45' }];
    const recentSales = [{ id: 's1', invoicenumber: 'INV-001', total: '50000', status: 'COMPLETED', createdat: new Date(), customer_name: 'Juan', user_name: 'Admin' }];
    const topProds = [{ name: 'Coca-Cola', code: 'P1', total_qty: '20' }];
    const lowStockRaw = [{ c: 2 }];

    (mockPrisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce(summaryRow)
      .mockResolvedValueOnce(recentSales)
      .mockResolvedValueOnce(topProds)
      .mockResolvedValueOnce(lowStockRaw);

    (mockPrisma.product.count as jest.Mock).mockResolvedValue(50);
    (mockPrisma.customer.count as jest.Mock).mockResolvedValueOnce(30).mockResolvedValueOnce(5);
    (mockPrisma.credit.aggregate as jest.Mock).mockResolvedValue({ _sum: { balance: 500000 }, _count: { id: 3 } });

    const { res, json } = makeRes();
    await dashboardController.getSummary(makeReq(), res, next);

    expect(mockCache.set).toHaveBeenCalledWith('dashboard:biz-1', expect.any(Object), 120);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const data = (json.mock.calls[0][0] as any).data;
    expect(data.inventory.totalProducts).toBe(50);
    expect(data.inventory.lowStock).toBe(2);
  });

  it('no falla si el cache.get lanza error (catch en promesa)', async () => {
    mockCache.get.mockRejectedValue(new Error('Redis error'));
    mockCache.set.mockResolvedValue('OK' as any);

    (mockPrisma.$queryRaw as jest.Mock)
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ c: 0 }]);

    (mockPrisma.product.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.customer.count as jest.Mock).mockResolvedValue(0);
    (mockPrisma.credit.aggregate as jest.Mock).mockResolvedValue({ _sum: { balance: null }, _count: { id: 0 } });

    const { res, json } = makeRes();
    await dashboardController.getSummary(makeReq(), res, next);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── getSalesChart ────────────────────────────────────────────────────────────

describe('dashboardController.getSalesChart', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna datos cacheados si el cache tiene el gráfico', async () => {
    const chartData = [{ date: '2026-07-01', total: 200000, count: 10 }];
    mockCache.get.mockResolvedValue(chartData as any);

    const { res, json } = makeRes();
    await dashboardController.getSalesChart(makeReq({ query: { period: '7d' } }), res, next);

    expect(mockCache.get).toHaveBeenCalledWith('chart:biz-1:7d');
    expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: chartData }));
  });

  it('consulta la base de datos para el período de 30 días por defecto', async () => {
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('OK' as any);

    const rows = [{ date: '2026-06-30', total: 100000, count: BigInt(5) }];
    (mockPrisma.$queryRaw as jest.Mock).mockResolvedValue(rows);

    const { res, json } = makeRes();
    await dashboardController.getSalesChart(makeReq(), res, next);

    expect(mockCache.set).toHaveBeenCalledWith('chart:biz-1:30d', expect.any(Array), 300);
    const data = (json.mock.calls[0][0] as any).data;
    expect(data[0].count).toBe(5);
  });
});