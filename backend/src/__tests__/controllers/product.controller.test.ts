import { Response, NextFunction } from 'express';
import { productController } from '../../controllers/product.controller';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { AuthRequest } from '../../middlewares/auth';
import { AppError } from '../../utils/response';

jest.mock('../../config/database', () => ({
  prisma: {
    product: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    branch: { findFirst: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../config/socket', () => ({
  emitToBusinesss: jest.fn(),
  socketEvents: { INVENTORY_UPDATED: 'inventory:updated', LOW_STOCK_ALERT: 'low_stock' },
}));

jest.mock('../../services/notification.service', () => ({
  notifyLowStock: jest.fn(),
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

function makeProduct(overrides = {}) {
  return {
    id: 'p1',
    code: 'PROD-001',
    name: 'Coca-Cola 350ml',
    stock: 100,
    minStock: 10,
    costPrice: 1200,
    salePrice: 2000,
    deletedAt: null,
    businessId: 'biz-1',
    ...overrides,
  };
}

// ─── list ────────────────────────────────────────────────────────────────────

describe('productController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna productos paginados del negocio', async () => {
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([makeProduct()]);
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);

    const { res, json } = makeRes();
    await productController.list(makeReq(), res, next);

    expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, businessId: 'biz-1' }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('filtra por categoryId y brandId cuando se proveen', async () => {
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(0);

    await productController.list(
      makeReq({ query: { categoryId: 'cat-1', brandId: 'br-1' } }),
      makeRes().res,
      next,
    );

    expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-1', brandId: 'br-1' }) })
    );
  });
});

// ─── getOne ──────────────────────────────────────────────────────────────────

describe('productController.getOne', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna el producto desde cache si existe', async () => {
    const product = makeProduct();
    mockCache.get.mockResolvedValue(product as any);

    const { res, json } = makeRes();
    await productController.getOne(makeReq({ params: { id: 'p1' } }), res, next);

    expect(mockCache.get).toHaveBeenCalledWith('product:biz-1:p1');
    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: product }));
  });

  it('retorna 404 cuando el producto no existe y no hay cache', async () => {
    mockCache.get.mockResolvedValue(null);
    (mockPrisma.product.findFirst as jest.Mock).mockResolvedValue(null);

    await productController.getOne(makeReq({ params: { id: 'p-x' } }), makeRes().res, next);

    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('retorna el producto y lo cachea cuando no hay cache', async () => {
    const product = makeProduct();
    mockCache.get.mockResolvedValue(null);
    mockCache.set.mockResolvedValue('OK' as any);
    (mockPrisma.product.findFirst as jest.Mock).mockResolvedValue(product);

    const { res, json } = makeRes();
    await productController.getOne(makeReq({ params: { id: 'p1' } }), res, next);

    expect(mockCache.set).toHaveBeenCalledWith('product:biz-1:p1', product, 300);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('productController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('crea el producto con movimiento de inventario inicial cuando stock > 0', async () => {
    const product = makeProduct({ stock: 10 });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        product: { create: jest.fn().mockResolvedValue(product) },
        inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
        business: { findUnique: jest.fn().mockResolvedValue({ plan: 'pro', planExpiresAt: null }) },
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      });
    });

    const { res, json } = makeRes();
    await productController.create(
      makeReq({ body: { name: 'Coca-Cola', code: 'PROD-001', costPrice: '1200', salePrice: '2000', stock: '10' } }),
      res,
      next,
    );

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('crea el producto sin movimiento de inventario cuando stock es 0', async () => {
    const product = makeProduct({ stock: 0 });
    const mockTxInventory = jest.fn();
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      return fn({
        product: { create: jest.fn().mockResolvedValue(product) },
        inventoryMovement: { create: mockTxInventory },
        business: { findUnique: jest.fn().mockResolvedValue({ plan: 'pro', planExpiresAt: null }) },
        $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      });
    });

    await productController.create(
      makeReq({ body: { name: 'Producto', code: 'P2', costPrice: '0', salePrice: '1000', stock: '0' } }),
      makeRes().res,
      next,
    );

    expect(mockTxInventory).not.toHaveBeenCalled();
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('productController.update', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando el producto no existe', async () => {
    (mockPrisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    await productController.update(
      makeReq({ params: { id: 'p-x' }, body: { name: 'X' } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('actualiza el producto e invalida el cache', async () => {
    (mockPrisma.product.findFirst as jest.Mock).mockResolvedValue(makeProduct());
    (mockPrisma.product.update as jest.Mock).mockResolvedValue(makeProduct({ name: 'Nuevo Nombre' }));
    mockCache.del.mockResolvedValue(1 as any);

    const { res, json } = makeRes();
    await productController.update(
      makeReq({ params: { id: 'p1' }, body: { name: 'Nuevo Nombre' } }),
      res,
      next,
    );

    expect(mockCache.del).toHaveBeenCalledWith('product:biz-1:p1');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe('productController.delete', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando el producto no existe', async () => {
    (mockPrisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    await productController.delete(makeReq({ params: { id: 'p-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('hace soft-delete e invalida el cache', async () => {
    (mockPrisma.product.findFirst as jest.Mock).mockResolvedValue(makeProduct());
    (mockPrisma.product.update as jest.Mock).mockResolvedValue({});
    mockCache.del.mockResolvedValue(1 as any);

    const { res, json } = makeRes();
    await productController.delete(makeReq({ params: { id: 'p1' } }), res, next);

    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) })
    );
    expect(mockCache.del).toHaveBeenCalledWith('product:biz-1:p1');
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});