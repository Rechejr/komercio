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
    productStock: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    branch: { findFirst: jest.fn(), findMany: jest.fn() },
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

  it('cuando se pasa branchId, reemplaza stock por el de esa bodega (POS)', async () => {
    (mockPrisma.product.findMany as jest.Mock).mockResolvedValue([
      makeProduct({ id: 'p1', stock: 100 }),
      makeProduct({ id: 'p2', stock: 50 }),
    ]);
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(2);
    (mockPrisma.productStock.findMany as jest.Mock).mockResolvedValue([
      { productId: 'p1', stock: 30 },
      // p2 no tiene fila en esta bodega -> debe caer a 0, NO al stock total
    ]);

    const { res, json } = makeRes();
    await productController.list(makeReq({ query: { branchId: 'br-1' } }), res, next);

    const payload = json.mock.calls[0][0];
    const byId = Object.fromEntries(payload.data.map((p: any) => [p.id, p.stock]));
    expect(byId.p1).toBe(30);
    expect(byId.p2).toBe(0);
  });
});

// ─── getStockByBranch ────────────────────────────────────────────────────────

describe('productController.getStockByBranch', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 si el producto no pertenece al negocio', async () => {
    (mockPrisma.product.findFirst as jest.Mock).mockResolvedValue(null);
    await productController.getStockByBranch(makeReq({ params: { id: 'p-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('retorna el stock por cada bodega, 0 si no tiene fila', async () => {
    (mockPrisma.product.findFirst as jest.Mock).mockResolvedValue({ id: 'p1' });
    (mockPrisma.branch.findMany as jest.Mock).mockResolvedValue([
      { id: 'br-1', name: 'Principal' },
      { id: 'br-2', name: 'Bodega Norte' },
    ]);
    (mockPrisma.productStock.findMany as jest.Mock).mockResolvedValue([
      { branchId: 'br-1', stock: 40 },
    ]);

    const { res, json } = makeRes();
    await productController.getStockByBranch(makeReq({ params: { id: 'p1' } }), res, next);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: [
        { branchId: 'br-1', branchName: 'Principal', stock: 40 },
        { branchId: 'br-2', branchName: 'Bodega Norte', stock: 0 },
      ],
    }));
  });
});

// ─── adjustStock ─────────────────────────────────────────────────────────────

describe('productController.adjustStock', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeAdjustTx(overrides: {
    productRow?: any;
    branchStock?: number;
  } = {}) {
    const productRow = overrides.productRow ?? {
      id: 'p1', stock: 100, name: 'Producto', allowNegativeStock: false,
      minStock: 10, businessId: 'biz-1', costPrice: 1000, lowStockNotifiedAt: null,
    };
    const branchStock = overrides.branchStock ?? 20;

    const txProductUpdate = jest.fn().mockResolvedValue({});
    const txProductStockUpdate = jest.fn().mockResolvedValue({});
    const txMovementCreate = jest.fn().mockResolvedValue({});
    const queryRawUnsafe = jest.fn()
      .mockResolvedValueOnce([productRow])
      .mockResolvedValueOnce([{ stock: branchStock }]);

    const tx = {
      $queryRawUnsafe: queryRawUnsafe,
      product: { update: txProductUpdate },
      productStock: { update: txProductStockUpdate },
      inventoryMovement: { create: txMovementCreate },
    };
    return { tx, txProductUpdate, txProductStockUpdate, txMovementCreate };
  }

  it('rechaza con 403 si el body pide una bodega distinta a la fija del usuario', async () => {
    await productController.adjustStock(
      makeReq({ params: { id: 'p1' }, body: { type: 'ADJUSTMENT', quantity: 5, branchId: 'otra-bodega' } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(403);
  });

  it('rechaza con 400 si el usuario no tiene bodega fija y el negocio tiene varias', async () => {
    (mockPrisma.branch.findMany as jest.Mock).mockResolvedValue([{ id: 'br-1' }, { id: 'br-2' }]);
    await productController.adjustStock(
      makeReq({ user: { userId: 'u-1', email: 'a@b.com', role: 'ADMIN', businessId: 'biz-1', branchId: undefined }, params: { id: 'p1' }, body: { type: 'ADJUSTMENT', quantity: 5 } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('ADJUSTMENT fija el valor absoluto de LA BODEGA, no del total', async () => {
    const { tx, txProductUpdate, txProductStockUpdate } = makeAdjustTx({ branchStock: 20 });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const { res, json } = makeRes();
    await productController.adjustStock(
      makeReq({ params: { id: 'p1' }, body: { type: 'ADJUSTMENT', quantity: 35, reason: 'Conteo' } }),
      res,
      next,
    );

    // bodega pasa de 20 a 35 -> delta +15 aplicado al TOTAL (que partía de 100)
    expect(txProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stock: { increment: 15 } }) })
    );
    expect(txProductStockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: 35 } })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { stock: 115 } }));
  });

  it('rechaza con 400 si el ajuste deja la bodega en negativo y no permite stock negativo', async () => {
    const { tx } = makeAdjustTx({ branchStock: 5 });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    await productController.adjustStock(
      makeReq({ params: { id: 'p1' }, body: { type: 'OUT', quantity: 10 } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
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
        productStock: { create: jest.fn().mockResolvedValue({}) },
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

// ─── bulkStockCount ──────────────────────────────────────────────────────────

describe('productController.bulkStockCount', () => {
  beforeEach(() => jest.clearAllMocks());

  function makeCountTx(rows: Record<string, { productRow: any; branchStock: number }>) {
    const txProductUpdate = jest.fn().mockResolvedValue({});
    const txProductStockUpdate = jest.fn().mockResolvedValue({});
    const txMovementCreate = jest.fn().mockResolvedValue({});

    const queryRawUnsafe = jest.fn().mockImplementation((_sql: string, ...args: any[]) => {
      // La primera llamada por producto es el lock de `products` (1 solo param: id);
      // la segunda es el lock-or-create de product_stocks (id nuevo, productId, branchId).
      const isProductLock = args.length === 1;
      const pid = isProductLock ? args[0] : args[1];
      const entry = rows[pid];
      if (isProductLock) return Promise.resolve(entry ? [entry.productRow] : []);
      return Promise.resolve([{ stock: entry.branchStock }]);
    });

    const tx = {
      $queryRawUnsafe: queryRawUnsafe,
      product: { update: txProductUpdate },
      productStock: { update: txProductStockUpdate },
      inventoryMovement: { create: txMovementCreate },
    };
    return { tx, txProductUpdate, txProductStockUpdate, txMovementCreate };
  }

  it('rechaza con 403 si la bodega no pertenece al negocio', async () => {
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue(null);
    await productController.bulkStockCount(
      makeReq({ body: { branchId: 'br-x', items: [{ productId: 'p1', quantity: 10 }] } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(403);
  });

  it('rechaza con 403 si algun producto no pertenece al negocio', async () => {
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: 'br-1' });
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(0);
    await productController.bulkStockCount(
      makeReq({ body: { branchId: 'br-1', items: [{ productId: 'p-invalido', quantity: 10 }] } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(403);
  });

  it('deduplica productId repetidos antes de validar pertenencia (no infla productIds.length)', async () => {
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: 'br-1' });
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1); // solo 1 producto distinto
    const { tx } = makeCountTx({
      p1: { productRow: { id: 'p1', stock: 10, name: 'P1', allowNegativeStock: false, minStock: 2, lowStockNotifiedAt: null, costPrice: 100 }, branchStock: 5 },
    });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const { res, json } = makeRes();
    // Mismo productId dos veces — el segundo valor debe ganar (último de la Map).
    await productController.bulkStockCount(
      makeReq({ body: { branchId: 'br-1', items: [{ productId: 'p1', quantity: 8 }, { productId: 'p1', quantity: 20 }] } }),
      res,
      next,
    );
    expect(mockPrisma.product.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['p1'] } }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { updated: 1, skipped: 0 } }));
  });

  it('salta productos sin cambio real (delta 0) sin crear movimiento', async () => {
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: 'br-1' });
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    const { tx, txMovementCreate, txProductUpdate } = makeCountTx({
      p1: { productRow: { id: 'p1', stock: 10, name: 'P1', allowNegativeStock: false, minStock: 2, lowStockNotifiedAt: null, costPrice: 100 }, branchStock: 10 },
    });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const { res, json } = makeRes();
    await productController.bulkStockCount(
      makeReq({ body: { branchId: 'br-1', items: [{ productId: 'p1', quantity: 10 }] } }),
      res,
      next,
    );
    expect(txMovementCreate).not.toHaveBeenCalled();
    expect(txProductUpdate).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: { updated: 0, skipped: 1 } }));
  });

  it('rechaza con 400 si el nuevo total quedaria negativo sin allowNegativeStock', async () => {
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: 'br-1' });
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    // Total actual 3; la bodega tenía 10 (más de lo que hay en el total, dato
    // ya inconsistente de antemano) — bajarla a 0 dejaría el total en -7.
    const { tx } = makeCountTx({
      p1: { productRow: { id: 'p1', stock: 3, name: 'P1', allowNegativeStock: false, minStock: 2, lowStockNotifiedAt: null, costPrice: 100 }, branchStock: 10 },
    });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    await productController.bulkStockCount(
      makeReq({ body: { branchId: 'br-1', items: [{ productId: 'p1', quantity: 0 }] } }),
      makeRes().res,
      next,
    );
    // branchDelta = 0 - 10 = -10; newTotal = 3 - 10 = -7 < 0
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('aplica el delta al total y fija el valor absoluto en la bodega', async () => {
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: 'br-1' });
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    const { tx, txProductUpdate, txProductStockUpdate, txMovementCreate } = makeCountTx({
      p1: { productRow: { id: 'p1', stock: 100, name: 'P1', allowNegativeStock: false, minStock: 10, lowStockNotifiedAt: null, costPrice: 500 }, branchStock: 20 },
    });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const { res, json } = makeRes();
    await productController.bulkStockCount(
      makeReq({ body: { branchId: 'br-1', items: [{ productId: 'p1', quantity: 5 }], reason: 'Conteo físico' } }),
      res,
      next,
    );

    // bodega pasa de 20 a 5 -> delta -15 -> total pasa de 100 a 85 (por encima de minStock=10)
    expect(txProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stock: { increment: -15 } }) })
    );
    expect(txProductStockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { stock: 5 } })
    );
    expect(txMovementCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OUT', quantity: 15, referenceType: 'STOCK_COUNT', reason: 'Conteo físico' }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: { updated: 1, skipped: 0 } }));
  });

  it('marca isNewLowStock cuando el total cae al minimo por primera vez y notifica', async () => {
    const { notifyLowStockBatch } = require('../../services/notification.service');
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: 'br-1' });
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    const { tx, txProductUpdate } = makeCountTx({
      p1: { productRow: { id: 'p1', stock: 20, name: 'P1', allowNegativeStock: false, minStock: 10, lowStockNotifiedAt: null, costPrice: 500 }, branchStock: 15 },
    });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    await productController.bulkStockCount(
      makeReq({ body: { branchId: 'br-1', items: [{ productId: 'p1', quantity: 5 }] } }),
      makeRes().res,
      next,
    );

    // bodega pasa de 15 a 5 -> delta -10 -> total pasa de 20 a 10, que es <= minStock(10)
    expect(txProductUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lowStockNotifiedAt: expect.any(Date) }) })
    );
    expect(notifyLowStockBatch).toHaveBeenCalledWith('biz-1', [
      expect.objectContaining({ id: 'p1', stock: 10, minStock: 10 }),
    ]);
  });

  it('procesa en lotes de 50 — mas de 50 items dispara mas de una transaccion', async () => {
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: 'br-1' });
    const items = Array.from({ length: 55 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }));
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(55);

    const rowsMap: Record<string, { productRow: any; branchStock: number }> = {};
    for (const it of items) {
      rowsMap[it.productId] = {
        productRow: { id: it.productId, stock: 0, name: it.productId, allowNegativeStock: false, minStock: 0, lowStockNotifiedAt: null, costPrice: 0 },
        branchStock: 0,
      };
    }
    const { tx } = makeCountTx(rowsMap);
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    await productController.bulkStockCount(
      makeReq({ body: { branchId: 'br-1', items } }),
      makeRes().res,
      next,
    );

    expect((mockPrisma.$transaction as jest.Mock).mock.calls.length).toBe(2); // 50 + 5
  });
});