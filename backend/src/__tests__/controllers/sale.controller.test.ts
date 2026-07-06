import { Response, NextFunction } from 'express';
import { saleController } from '../../controllers/sale.controller';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { AuthRequest } from '../../middlewares/auth';
import { AppError } from '../../utils/response';

jest.mock('../../config/database', () => ({
  prisma: {
    sale: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
      delete: jest.fn(),
    },
    product: { count: jest.fn(), update: jest.fn() },
    branch: { findFirst: jest.fn() },
    cashRegister: { findFirst: jest.fn() },
    cashMovement: { create: jest.fn() },
    credit: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
    customer: { update: jest.fn() },
    inventoryMovement: { create: jest.fn(), deleteMany: jest.fn() },
    saleDetail: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
    $queryRawUnsafe: jest.fn(),
    // generateInvoiceNumber now runs BEFORE the transaction (auto-commit counter).
    // counterTableReady() uses $executeRaw; the counter upsert uses $queryRaw.
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([{ lastSeq: 1 }]),
  },
}));

jest.mock('../../config/redis', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../../config/socket', () => ({
  emitToBusinesss: jest.fn(),
  socketEvents: {
    NEW_SALE: 'sale:new',
    LOW_STOCK_ALERT: 'low_stock',
    INVENTORY_UPDATED: 'inventory:updated',
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('../../services/notification.service', () => ({
  notifyLowStockBatch: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../utils/pagination', () => ({
  getPagination: jest.fn().mockReturnValue({ page: 1, limit: 20, skip: 0 }),
  getSearch: jest.fn().mockReturnValue(undefined),
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

function makeSale(overrides = {}) {
  return {
    id: 's1',
    invoiceNumber: 'FAC-20260705-000001',
    total: 50000,
    paidAmount: 50000,
    changeAmount: 0,
    taxAmount: 0,
    discountAmount: 0,
    subtotal: 50000,
    status: 'COMPLETED',
    paymentMethod: 'CASH',
    branchId: 'br-1',
    details: [{ productId: 'p1', quantity: 2, costPrice: 1200 }],
    ...overrides,
  };
}

// ─── list ────────────────────────────────────────────────────────────────────

describe('saleController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna ventas paginadas del negocio', async () => {
    (mockPrisma.sale.findMany as jest.Mock).mockResolvedValue([makeSale()]);
    (mockPrisma.sale.count as jest.Mock).mockResolvedValue(1);

    const { res, json } = makeRes();
    await saleController.list(makeReq(), res, next);

    expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('filtra por status cuando se provee', async () => {
    (mockPrisma.sale.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.sale.count as jest.Mock).mockResolvedValue(0);

    await saleController.list(makeReq({ query: { status: 'CANCELLED' } }), makeRes().res, next);

    expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'CANCELLED' }) })
    );
  });
});

// ─── getOne ──────────────────────────────────────────────────────────────────

describe('saleController.getOne', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando la venta no existe', async () => {
    (mockPrisma.sale.findFirst as jest.Mock).mockResolvedValue(null);
    await saleController.getOne(makeReq({ params: { id: 's-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('retorna la venta con sus relaciones', async () => {
    (mockPrisma.sale.findFirst as jest.Mock).mockResolvedValue(makeSale());
    const { res, json } = makeRes();
    await saleController.getOne(makeReq({ params: { id: 's1' } }), res, next);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('saleController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 cuando no hay productos en la venta', async () => {
    await saleController.create(makeReq({ body: { items: [] } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('retorna 400 cuando es venta a crédito sin cliente', async () => {
    await saleController.create(
      makeReq({ body: { items: [{ productId: 'p1', quantity: 1 }], isCredit: true } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('retorna 400 cuando productos no existen o son inactivos', async () => {
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(0);
    await saleController.create(
      makeReq({ body: { items: [{ productId: 'p-invalid', quantity: 1 }], paymentMethod: 'CASH' } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('crea la venta y descontar stock correctamente', async () => {
    const sale = makeSale();
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue({ newSale: sale, lowStockProducts: [] });
    mockCache.del.mockResolvedValue(1 as any);

    const { res, json } = makeRes();
    await saleController.create(
      makeReq({ body: { items: [{ productId: 'p1', quantity: 2 }], paymentMethod: 'CASH' } }),
      res,
      next,
    );

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockCache.del).toHaveBeenCalledWith('dashboard:biz-1');
  });

  it('no falla si el movimiento de caja lanza error (best-effort)', async () => {
    const sale = makeSale({ paymentMethod: 'CASH' });
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue({ newSale: sale, lowStockProducts: [] });
    (mockPrisma.cashRegister.findFirst as jest.Mock).mockRejectedValue(new Error('DB error'));
    mockCache.del.mockResolvedValue(1 as any);

    const { res, json } = makeRes();
    await saleController.create(
      makeReq({ body: { items: [{ productId: 'p1', quantity: 1 }], paymentMethod: 'CASH' } }),
      res,
      next,
    );

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── cancel ──────────────────────────────────────────────────────────────────

describe('saleController.cancel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando la venta no existe', async () => {
    (mockPrisma.sale.findFirst as jest.Mock).mockResolvedValue(null);
    await saleController.cancel(makeReq({ params: { id: 's-x' }, body: { reason: 'Error' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('retorna 400 cuando la venta ya fue anulada', async () => {
    (mockPrisma.sale.findFirst as jest.Mock).mockResolvedValue(makeSale({ status: 'CANCELLED' }));
    await saleController.cancel(makeReq({ params: { id: 's1' }, body: { reason: 'Duplicada' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('anula la venta y revierte el stock', async () => {
    (mockPrisma.sale.findFirst as jest.Mock).mockResolvedValue(makeSale());
    (mockPrisma.$transaction as jest.Mock).mockResolvedValue(undefined);
    mockCache.del.mockResolvedValue(1 as any);

    const { res, json } = makeRes();
    await saleController.cancel(makeReq({ params: { id: 's1' }, body: { reason: 'Error del usuario' } }), res, next);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(mockCache.del).toHaveBeenCalledWith('dashboard:biz-1');
  });
});

// ─── getDailySummary ──────────────────────────────────────────────────────────

describe('saleController.getDailySummary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna el resumen de ventas del día', async () => {
    (mockPrisma.sale.aggregate as jest.Mock).mockResolvedValue({
      _sum: { total: 300000, taxAmount: 30000, discountAmount: 10000 },
      _count: { id: 12 },
    });

    const { res, json } = makeRes();
    await saleController.getDailySummary(makeReq(), res, next);

    expect(mockPrisma.sale.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'COMPLETED' }) })
    );
    const data = (json.mock.calls[0][0] as any).data;
    expect(data.total).toBe(300000);
    expect(data.count).toBe(12);
  });

  it('retorna ceros cuando no hay ventas en el día', async () => {
    (mockPrisma.sale.aggregate as jest.Mock).mockResolvedValue({
      _sum: { total: null, taxAmount: null, discountAmount: null },
      _count: { id: 0 },
    });

    const { res, json } = makeRes();
    await saleController.getDailySummary(makeReq(), res, next);

    const data = (json.mock.calls[0][0] as any).data;
    expect(data.total).toBe(0);
    expect(data.count).toBe(0);
  });
});