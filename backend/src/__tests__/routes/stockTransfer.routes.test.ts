import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../config/database', () => ({
  prisma: {
    stockTransfer: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
    branch: { findMany: jest.fn() },
    product: { count: jest.fn() },
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

function authHeader(role: string) {
  mockJwt.verifyAccessToken.mockReturnValue({
    userId: 'user-1', email: 'admin@test.com', role, businessId: 'biz-1', branchId: null,
  } as any);
  return { Authorization: 'Bearer valid-token' };
}

const FROM = '11111111-1111-4111-8111-111111111111';
const TO   = '22222222-2222-4222-8222-222222222222';
const PROD = '33333333-3333-4333-8333-333333333333';

function validBody(overrides: any = {}) {
  return {
    fromBranchId: FROM,
    toBranchId: TO,
    items: [{ productId: PROD, quantity: 10 }],
    ...overrides,
  };
}

function makeTransferTx(opts: { fromStock?: number; toStock?: number; allowNegativeStock?: boolean } = {}) {
  const fromStock = opts.fromStock ?? 50;
  const toStock = opts.toStock ?? 5;

  const txProductStockUpdate = jest.fn().mockResolvedValue({});
  const txMovementCreate = jest.fn().mockResolvedValue({});
  const txStockTransferCreate = jest.fn().mockResolvedValue({ id: 'transfer-1' });

  const queryRawUnsafe = jest.fn().mockImplementation((_sql: string, _id: string, _productId: string, branchId: string) => {
    if (branchId === FROM) return Promise.resolve([{ stock: fromStock }]);
    return Promise.resolve([{ stock: toStock }]);
  });

  const tx = {
    stockTransfer: { create: txStockTransferCreate },
    $queryRawUnsafe: queryRawUnsafe,
    product: { findUnique: jest.fn().mockResolvedValue({ allowNegativeStock: opts.allowNegativeStock ?? false, name: 'Producto X' }) },
    productStock: { update: txProductStockUpdate },
    inventoryMovement: { create: txMovementCreate },
  };
  return { tx, txProductStockUpdate, txMovementCreate, txStockTransferCreate };
}

describe('POST /api/v1/stock-transfers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 403 si el rol no es ADMIN ni SUPERVISOR', async () => {
    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(authHeader('CASHIER'))
      .send(validBody());

    expect(res.status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('retorna 400 si la bodega de origen y destino son la misma', async () => {
    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(authHeader('ADMIN'))
      .send(validBody({ toBranchId: FROM }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/distintas/i);
  });

  it('rechaza cuando falta un campo requerido (validador)', async () => {
    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(authHeader('SUPERVISOR'))
      .send({ fromBranchId: FROM, toBranchId: TO, items: [] });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('retorna 403 si alguna bodega no pertenece al negocio', async () => {
    (mockPrisma.branch.findMany as jest.Mock).mockResolvedValue([{ id: FROM }]); // solo 1, no 2
    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(authHeader('ADMIN'))
      .send(validBody());

    expect(res.status).toBe(403);
  });

  it('rechaza con 400 cuando la bodega de origen no tiene stock suficiente', async () => {
    (mockPrisma.branch.findMany as jest.Mock).mockResolvedValue([{ id: FROM }, { id: TO }]);
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    const { tx } = makeTransferTx({ fromStock: 2 }); // pide 10, solo hay 2
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(authHeader('ADMIN'))
      .send(validBody());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stock insuficiente/i);
  });

  it('registra la transferencia y mueve el stock entre bodegas sin tocar el total del producto', async () => {
    (mockPrisma.branch.findMany as jest.Mock).mockResolvedValue([{ id: FROM }, { id: TO }]);
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    const { tx, txProductStockUpdate, txMovementCreate } = makeTransferTx({ fromStock: 50 });
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(authHeader('ADMIN'))
      .send(validBody({ items: [{ productId: PROD, quantity: 10 }] }));

    expect(res.status).toBe(201);
    // Descuenta 10 del origen, suma 10 al destino — Product.stock (el total) ni se menciona.
    expect(txProductStockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_branchId: { productId: PROD, branchId: FROM } },
        data: { stock: { decrement: 10 } },
      })
    );
    expect(txProductStockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_branchId: { productId: PROD, branchId: TO } },
        data: { stock: { increment: 10 } },
      })
    );
    expect(txMovementCreate).toHaveBeenCalledTimes(2);
  });
});
