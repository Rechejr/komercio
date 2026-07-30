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

const FROM  = '11111111-1111-4111-8111-111111111111';
const TO    = '22222222-2222-4222-8222-222222222222';
const PROD  = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const XFER  = '55555555-5555-4555-8555-555555555555';

const BRANCH_NAMES: Record<string, string> = { [FROM]: 'Bodega A', [TO]: 'Bodega B', [OTHER]: 'Bodega C' };

function validBody(overrides: any = {}) {
  return {
    fromBranchId: FROM,
    toBranchId: TO,
    items: [{ productId: PROD, quantity: 10 }],
    ...overrides,
  };
}

/** Stock por bodega que verá el handler al bloquear las filas de product_stocks. */
function makeTransferTx(opts: { stockByBranch?: Record<string, number>; allowNegativeStock?: boolean } = {}) {
  const stockByBranch = opts.stockByBranch ?? { [FROM]: 50, [TO]: 5, [OTHER]: 0 };

  const txProductStockUpdate = jest.fn().mockResolvedValue({});
  const txMovementCreate = jest.fn().mockResolvedValue({});
  const txStockTransferCreate = jest.fn().mockResolvedValue({ id: XFER });
  const txStockTransferUpdate = jest.fn().mockResolvedValue({ id: XFER });
  const txItemDeleteMany = jest.fn().mockResolvedValue({ count: 1 });

  const queryRawUnsafe = jest.fn().mockImplementation((_sql: string, _id: string, _productId: string, branchId: string) =>
    Promise.resolve([{ stock: stockByBranch[branchId] ?? 0 }]));

  const tx = {
    stockTransfer: { create: txStockTransferCreate, update: txStockTransferUpdate },
    stockTransferItem: { deleteMany: txItemDeleteMany },
    $queryRawUnsafe: queryRawUnsafe,
    product: { findUnique: jest.fn().mockResolvedValue({ allowNegativeStock: opts.allowNegativeStock ?? false, name: 'Producto X' }) },
    productStock: { update: txProductStockUpdate },
    inventoryMovement: { create: txMovementCreate },
  };
  return { tx, txProductStockUpdate, txMovementCreate, txStockTransferCreate, txStockTransferUpdate, txItemDeleteMany };
}

/** Bodegas + productos válidos y una transacción lista para ejecutarse. */
function arrangeHappyPath(txOpts?: Parameters<typeof makeTransferTx>[0]) {
  (mockPrisma.branch.findMany as jest.Mock).mockImplementation(({ where }: any) =>
    Promise.resolve((where.id.in as string[]).map((id) => ({ id, name: BRANCH_NAMES[id] }))));
  (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
  const made = makeTransferTx(txOpts);
  (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(made.tx));
  return made;
}

function existingTransfer(overrides: any = {}) {
  return {
    id: XFER,
    fromBranchId: FROM,
    toBranchId: TO,
    fromBranch: { id: FROM, name: BRANCH_NAMES[FROM] },
    toBranch: { id: TO, name: BRANCH_NAMES[TO] },
    items: [{ id: 'item-1', productId: PROD, quantity: 10 }],
    ...overrides,
  };
}

/** Extrae el ajuste aplicado a (producto, bodega) — Prisma usa `increment` firmado. */
function stockDeltaFor(mock: jest.Mock, branchId: string): number | undefined {
  const call = mock.mock.calls.find(([arg]: any[]) => arg.where.productId_branchId.branchId === branchId);
  return call?.[0].data.stock.increment;
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
    (mockPrisma.branch.findMany as jest.Mock).mockResolvedValue([{ id: FROM, name: 'Bodega A' }]); // solo 1, no 2
    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(authHeader('ADMIN'))
      .send(validBody());

    expect(res.status).toBe(403);
  });

  it('rechaza con 400 cuando la bodega de origen no tiene stock suficiente', async () => {
    const { txProductStockUpdate } = arrangeHappyPath({ stockByBranch: { [FROM]: 2, [TO]: 5 } }); // pide 10, solo hay 2

    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(authHeader('ADMIN'))
      .send(validBody());

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/stock insuficiente/i);
    expect(res.body.error).toContain('Bodega A');
    // Se valida TODO antes de escribir: ni una sola bodega quedó tocada.
    expect(txProductStockUpdate).not.toHaveBeenCalled();
  });

  it('registra la transferencia y mueve el stock entre bodegas sin tocar el total del producto', async () => {
    const { txProductStockUpdate, txMovementCreate } = arrangeHappyPath();

    const res = await request(app)
      .post('/api/v1/stock-transfers')
      .set(authHeader('ADMIN'))
      .send(validBody({ items: [{ productId: PROD, quantity: 10 }] }));

    expect(res.status).toBe(201);
    // Descuenta 10 del origen, suma 10 al destino — Product.stock (el total) ni se menciona.
    expect(stockDeltaFor(txProductStockUpdate, FROM)).toBe(-10);
    expect(stockDeltaFor(txProductStockUpdate, TO)).toBe(10);
    expect(txMovementCreate).toHaveBeenCalledTimes(2);
  });
});

describe('PUT /api/v1/stock-transfers/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 403 si el rol no es ADMIN ni SUPERVISOR', async () => {
    const res = await request(app)
      .put(`/api/v1/stock-transfers/${XFER}`)
      .set(authHeader('CASHIER'))
      .send(validBody());

    expect(res.status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('retorna 404 si la transferencia no existe o es de otro negocio', async () => {
    (mockPrisma.stockTransfer.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .put(`/api/v1/stock-transfers/${XFER}`)
      .set(authHeader('ADMIN'))
      .send(validBody());

    expect(res.status).toBe(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('mueve solo el delta al cambiar la cantidad (10 → 12), no la transferencia completa', async () => {
    (mockPrisma.stockTransfer.findFirst as jest.Mock).mockResolvedValue(existingTransfer());
    const { txProductStockUpdate, txItemDeleteMany } = arrangeHappyPath();

    const res = await request(app)
      .put(`/api/v1/stock-transfers/${XFER}`)
      .set(authHeader('ADMIN'))
      .send(validBody({ items: [{ productId: PROD, quantity: 12 }] }));

    expect(res.status).toBe(200);
    expect(stockDeltaFor(txProductStockUpdate, FROM)).toBe(-2);
    expect(stockDeltaFor(txProductStockUpdate, TO)).toBe(2);
    expect(txItemDeleteMany).toHaveBeenCalledWith({ where: { transferId: XFER } });
  });

  it('al cambiar la bodega de destino devuelve el stock a la vieja y lo manda a la nueva', async () => {
    (mockPrisma.stockTransfer.findFirst as jest.Mock).mockResolvedValue(existingTransfer());
    const { txProductStockUpdate } = arrangeHappyPath({ stockByBranch: { [FROM]: 50, [TO]: 10, [OTHER]: 0 } });

    const res = await request(app)
      .put(`/api/v1/stock-transfers/${XFER}`)
      .set(authHeader('ADMIN'))
      .send(validBody({ toBranchId: OTHER, items: [{ productId: PROD, quantity: 10 }] }));

    expect(res.status).toBe(200);
    // El origen no cambia (sale y vuelve a salir lo mismo) → delta 0, sin escritura.
    expect(stockDeltaFor(txProductStockUpdate, FROM)).toBeUndefined();
    expect(stockDeltaFor(txProductStockUpdate, TO)).toBe(-10);
    expect(stockDeltaFor(txProductStockUpdate, OTHER)).toBe(10);
  });

  it('rechaza con 400 si el destino ya vendió lo recibido y la edición lo dejaría en negativo', async () => {
    (mockPrisma.stockTransfer.findFirst as jest.Mock).mockResolvedValue(existingTransfer());
    // Llegaron 10 al destino pero solo quedan 3: bajar la transferencia a 1 exige devolver 9.
    const { txProductStockUpdate } = arrangeHappyPath({ stockByBranch: { [FROM]: 50, [TO]: 3 } });

    const res = await request(app)
      .put(`/api/v1/stock-transfers/${XFER}`)
      .set(authHeader('ADMIN'))
      .send(validBody({ items: [{ productId: PROD, quantity: 1 }] }));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no se puede editar la transferencia/i);
    expect(res.body.error).toContain('Bodega B');
    expect(txProductStockUpdate).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/v1/stock-transfers/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 403 si el rol no es ADMIN ni SUPERVISOR', async () => {
    const res = await request(app)
      .delete(`/api/v1/stock-transfers/${XFER}`)
      .set(authHeader('CASHIER'));

    expect(res.status).toBe(403);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('retorna 404 si la transferencia no existe o es de otro negocio', async () => {
    (mockPrisma.stockTransfer.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .delete(`/api/v1/stock-transfers/${XFER}`)
      .set(authHeader('ADMIN'));

    expect(res.status).toBe(404);
  });

  it('revierte el stock y marca la transferencia como eliminada (soft delete)', async () => {
    (mockPrisma.stockTransfer.findFirst as jest.Mock).mockResolvedValue(existingTransfer());
    const { txProductStockUpdate, txStockTransferUpdate } = arrangeHappyPath({ stockByBranch: { [FROM]: 40, [TO]: 15 } });

    const res = await request(app)
      .delete(`/api/v1/stock-transfers/${XFER}`)
      .set(authHeader('ADMIN'));

    expect(res.status).toBe(200);
    expect(stockDeltaFor(txProductStockUpdate, FROM)).toBe(10);  // vuelve al origen
    expect(stockDeltaFor(txProductStockUpdate, TO)).toBe(-10);   // sale del destino
    expect(txStockTransferUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: XFER },
      data: { deletedAt: expect.any(Date) },
    }));
  });

  it('rechaza con 400 si el destino ya vendió la mercancía transferida', async () => {
    (mockPrisma.stockTransfer.findFirst as jest.Mock).mockResolvedValue(existingTransfer());
    const { txProductStockUpdate, txStockTransferUpdate } = arrangeHappyPath({ stockByBranch: { [FROM]: 40, [TO]: 2 } });

    const res = await request(app)
      .delete(`/api/v1/stock-transfers/${XFER}`)
      .set(authHeader('ADMIN'));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no se puede eliminar la transferencia/i);
    expect(txProductStockUpdate).not.toHaveBeenCalled();
    expect(txStockTransferUpdate).not.toHaveBeenCalled();
  });
});
