import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../config/database', () => ({
  prisma: {
    purchase: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    product: { count: jest.fn() },
    supplier: { findFirst: jest.fn() },
    branch: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
}));

jest.mock('../../utils/jwt', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockJwt = jwtUtils as jest.Mocked<typeof jwtUtils>;

function authHeader(role: string, branchId: string | null = 'br-1') {
  mockJwt.verifyAccessToken.mockReturnValue({
    userId: 'user-1', email: 'admin@test.com', role, businessId: 'biz-1', branchId,
  } as any);
  return { Authorization: 'Bearer valid-token' };
}

const PROD = '33333333-3333-4333-8333-333333333333';

describe('POST /api/v1/purchases', () => {
  beforeEach(() => jest.clearAllMocks());

  it('registra la compra e incrementa el stock de la bodega resuelta (branchId fijo del usuario)', async () => {
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);

    const txPurchaseCreate = jest.fn().mockResolvedValue({ id: 'purch-1' });
    const txProductUpdate = jest.fn().mockResolvedValue({});
    const txExecuteRawUnsafe = jest.fn().mockResolvedValue(0);
    const txMovementCreate = jest.fn().mockResolvedValue({});
    const tx = {
      purchase: { create: txPurchaseCreate },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: PROD, stock: 10, minStock: 2, lowStockNotifiedAt: null }]),
      $executeRawUnsafe: txExecuteRawUnsafe,
      product: { update: txProductUpdate },
      inventoryMovement: { create: txMovementCreate },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .post('/api/v1/purchases')
      .set(authHeader('ADMIN', 'br-1'))
      .send({ items: [{ productId: PROD, quantity: 5, unitCost: 1000 }] });

    expect(res.status).toBe(201);
    expect(txPurchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ branchId: 'br-1' }) })
    );
    // Incrementa el stock de la bodega br-1 vía INSERT...ON CONFLICT — no toca otra bodega.
    expect(txExecuteRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('product_stocks'),
      expect.any(String), PROD, 'br-1', 5,
    );
  });
});

describe('DELETE /api/v1/purchases/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rechaza con 400 si eliminarla dejaría la bodega en negativo, aunque el total del negocio no', async () => {
    (mockPrisma.purchase.findFirst as jest.Mock).mockResolvedValue({
      id: 'purch-1',
      branchId: 'br-1',
      details: [{ productId: PROD, quantity: 8, unitCost: 1000 }],
    });

    const tx = {
      $queryRawUnsafe: jest.fn()
        // Lock de products: el total del negocio (100) sí alcanza para restar 8
        .mockResolvedValueOnce([{ id: PROD, stock: 100, allowNegativeStock: false, name: 'Producto X' }])
        // Lock/creación de product_stocks en br-1: solo hay 3 unidades ahí
        .mockResolvedValueOnce([{ stock: 3 }]),
      product: { update: jest.fn() },
      productStock: { update: jest.fn() },
      inventoryMovement: { create: jest.fn() },
      purchase: { update: jest.fn() },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .delete('/api/v1/purchases/purch-1')
      .set(authHeader('ADMIN', 'br-1'));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/negativo/i);
    expect(tx.purchase.update).not.toHaveBeenCalled();
  });

  it('elimina la compra y decrementa el stock de la bodega cuando hay suficiente', async () => {
    (mockPrisma.purchase.findFirst as jest.Mock).mockResolvedValue({
      id: 'purch-1',
      branchId: 'br-1',
      details: [{ productId: PROD, quantity: 5, unitCost: 1000 }],
    });

    const txProductStockUpdate = jest.fn().mockResolvedValue({});
    const txPurchaseUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ id: PROD, stock: 100, allowNegativeStock: false, name: 'Producto X' }])
        .mockResolvedValueOnce([{ stock: 20 }]),
      product: { update: jest.fn().mockResolvedValue({}) },
      productStock: { update: txProductStockUpdate },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      purchase: { update: txPurchaseUpdate },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .delete('/api/v1/purchases/purch-1')
      .set(authHeader('ADMIN', 'br-1'));

    expect(res.status).toBe(200);
    expect(txProductStockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_branchId: { productId: PROD, branchId: 'br-1' } },
        data: { stock: { decrement: 5 } },
      })
    );
    expect(txPurchaseUpdate).toHaveBeenCalled();
  });
});
