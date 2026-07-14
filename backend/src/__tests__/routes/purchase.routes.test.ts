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
    cashRegister: { findFirst: jest.fn() },
    cashMovement: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), delete: jest.fn() },
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
const PROD2 = '44444444-4444-4444-8444-444444444444';
// items.*.branchId se valida con isUUID() — hace falta formato real, no 'br-1'.
const BR1 = '11111111-1111-4111-8111-111111111111';
const BR2 = '22222222-2222-4222-8222-222222222222';

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

  it('registra una compra con 2 líneas en 2 bodegas distintas — cada product_stocks recibe su propia bodega', async () => {
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(2);
    (mockPrisma.branch.findFirst as jest.Mock).mockImplementation(({ where }: any) => Promise.resolve({ id: where.id }));

    const txPurchaseCreate = jest.fn().mockResolvedValue({ id: 'purch-1' });
    const txExecuteRawUnsafe = jest.fn().mockResolvedValue(0);
    const tx = {
      purchase: { create: txPurchaseCreate },
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ id: PROD, stock: 10, minStock: 2, lowStockNotifiedAt: null }])
        .mockResolvedValueOnce([{ id: PROD2, stock: 4, minStock: 2, lowStockNotifiedAt: null }]),
      $executeRawUnsafe: txExecuteRawUnsafe,
      product: { update: jest.fn().mockResolvedValue({}) },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    // ADMIN sin bodega fija: puede elegir bodega por línea libremente.
    const res = await request(app)
      .post('/api/v1/purchases')
      .set(authHeader('ADMIN', null))
      .send({
        items: [
          { productId: PROD, quantity: 30, unitCost: 1000, branchId: BR1 },
          { productId: PROD2, quantity: 20, unitCost: 2000, branchId: BR2 },
        ],
      });

    expect(res.status).toBe(201);
    expect(txExecuteRawUnsafe).toHaveBeenNthCalledWith(1, expect.stringContaining('product_stocks'), expect.any(String), PROD, BR1, 30);
    expect(txExecuteRawUnsafe).toHaveBeenNthCalledWith(2, expect.stringContaining('product_stocks'), expect.any(String), PROD2, BR2, 20);
    // Purchase.branchId queda alineado con la primera línea, solo de referencia/compat.
    expect(txPurchaseCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ branchId: BR1 }) }),
    );
  });

  it('no rechaza cuando el MISMO producto se repite en varias líneas con bodegas distintas (bug: product.count con id duplicados en "in" solo cuenta filas distintas)', async () => {
    // Solo 1 producto real de por medio, pero aparece en 3 líneas — product.count
    // con `id: { in: [...] }` deduplica internamente (PK única), así que sin
    // dedupe en el código, productIds.length (3) nunca cuadraba con validCount (1).
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.branch.findFirst as jest.Mock).mockImplementation(({ where }: any) => Promise.resolve({ id: where.id }));

    const tx = {
      purchase: { create: jest.fn().mockResolvedValue({ id: 'purch-1' }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: PROD, stock: 10, minStock: 2, lowStockNotifiedAt: null }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      product: { update: jest.fn().mockResolvedValue({}) },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .post('/api/v1/purchases')
      .set(authHeader('ADMIN', null))
      .send({
        items: [
          { productId: PROD, quantity: 5, unitCost: 1000, branchId: BR1 },
          { productId: PROD, quantity: 5, unitCost: 1000, branchId: BR2 },
          { productId: PROD, quantity: 1, unitCost: 1000, branchId: BR1 },
        ],
      });

    expect(res.status).toBe(201);
  });

  it('crea un movimiento de caja OUT cuando la compra se paga en efectivo y hay una caja abierta', async () => {
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.cashRegister.findFirst as jest.Mock).mockResolvedValue({ id: 'reg-1' });

    const tx = {
      purchase: { create: jest.fn().mockResolvedValue({ id: 'purch-1', total: 5000 }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: PROD, stock: 10, minStock: 2, lowStockNotifiedAt: null }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      product: { update: jest.fn().mockResolvedValue({}) },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .post('/api/v1/purchases')
      .set(authHeader('ADMIN', 'br-1'))
      .send({ items: [{ productId: PROD, quantity: 5, unitCost: 1000 }], paymentMethod: 'CASH' });

    expect(res.status).toBe(201);
    expect(mockPrisma.cashRegister.findFirst).toHaveBeenCalledWith({ where: { branchId: 'br-1', status: 'OPEN' } });
    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cashRegisterId: 'reg-1', type: 'OUT', amount: 5000, referenceId: 'purch-1' }),
      }),
    );
  });

  it('no falla el registro de la compra si el movimiento de caja falla (best effort)', async () => {
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.cashRegister.findFirst as jest.Mock).mockRejectedValue(new Error('db down'));

    const tx = {
      purchase: { create: jest.fn().mockResolvedValue({ id: 'purch-1', total: 5000 }) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: PROD, stock: 10, minStock: 2, lowStockNotifiedAt: null }]),
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
      product: { update: jest.fn().mockResolvedValue({}) },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .post('/api/v1/purchases')
      .set(authHeader('ADMIN', 'br-1'))
      .send({ items: [{ productId: PROD, quantity: 5, unitCost: 1000 }] });

    expect(res.status).toBe(201);
  });

  it('rechaza con 403 si un cajero con bodega fija manda items[].branchId de otra bodega', async () => {
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);

    const res = await request(app)
      .post('/api/v1/purchases')
      .set(authHeader('CASHIER', BR1))
      .send({ items: [{ productId: PROD, quantity: 5, unitCost: 1000, branchId: BR2 }] });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/no tienes acceso/i);
    // Falla en el Promise.all previo a abrir la transacción — no debió escribir nada.
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/purchases/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mover una línea existente de bodega revierte el stock de la vieja y lo aplica en la nueva (clave compuesta productId+branchId)', async () => {
    (mockPrisma.purchase.findFirst as jest.Mock).mockResolvedValue({
      id: 'purch-1',
      businessId: 'biz-1',
      branchId: BR1,
      purchaseDate: new Date('2026-07-01'),
      details: [{ id: 'd1', productId: PROD, quantity: 10, unitCost: 1000, branchId: BR1 }],
    });
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);

    const txProductStockUpdate = jest.fn().mockResolvedValue({});
    const txPurchaseUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: BR2 }) },
      $queryRawUnsafe: jest.fn()
        // key vieja (PROD, BR1): lock del producto + upsert de stock en BR1
        .mockResolvedValueOnce([{ id: PROD, stock: 100, allowNegativeStock: false, name: 'Producto X', minStock: 2, lowStockNotifiedAt: null }])
        .mockResolvedValueOnce([{ stock: 50 }])
        // key nueva (PROD, BR2): lock del producto + upsert de stock en BR2
        .mockResolvedValueOnce([{ id: PROD, stock: 100, allowNegativeStock: false, name: 'Producto X', minStock: 2, lowStockNotifiedAt: null }])
        .mockResolvedValueOnce([{ stock: 5 }]),
      product: { update: jest.fn().mockResolvedValue({}) },
      productStock: { update: txProductStockUpdate },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      purchaseDetail: { deleteMany: jest.fn().mockResolvedValue({}) },
      purchase: { update: txPurchaseUpdate },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .put('/api/v1/purchases/purch-1')
      .set(authHeader('ADMIN', null))
      .send({ items: [{ productId: PROD, quantity: 10, unitCost: 1000, branchId: BR2 }] });

    expect(res.status).toBe(200);
    expect(txProductStockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_branchId: { productId: PROD, branchId: BR1 } },
        data: { stock: { increment: -10 } },
      }),
    );
    expect(txProductStockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { productId_branchId: { productId: PROD, branchId: BR2 } },
        data: { stock: { increment: 10 } },
      }),
    );
    expect(txPurchaseUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ branchId: BR2 }) }),
    );
  });

  it('si se cambia de Efectivo a otro método y la caja donde se registró sigue abierta, borra el movimiento de caja', async () => {
    (mockPrisma.purchase.findFirst as jest.Mock).mockResolvedValue({
      id: 'purch-1',
      businessId: 'biz-1',
      branchId: BR1,
      paymentMethod: 'CASH',
      purchaseDate: new Date('2026-07-01'),
      details: [{ id: 'd1', productId: PROD, quantity: 10, unitCost: 1000, branchId: BR1 }],
    });
    (mockPrisma.product.count as jest.Mock).mockResolvedValue(1);
    (mockPrisma.cashMovement.findFirst as jest.Mock).mockResolvedValue({ id: 'mov-1', cashRegister: { status: 'OPEN' } });

    const tx = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: BR1 }) },
      // Misma bodega y cantidad — delta 0, solo entra al lock del producto.
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ id: PROD, stock: 100, allowNegativeStock: false, name: 'Producto X', minStock: 2, lowStockNotifiedAt: null }]),
      product: { update: jest.fn().mockResolvedValue({}) },
      productStock: { update: jest.fn().mockResolvedValue({}) },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      purchaseDetail: { deleteMany: jest.fn().mockResolvedValue({}) },
      purchase: { update: jest.fn().mockResolvedValue({ id: 'purch-1', total: 10000 }) },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .put('/api/v1/purchases/purch-1')
      .set(authHeader('ADMIN', null))
      .send({ items: [{ productId: PROD, quantity: 10, unitCost: 1000, branchId: BR1 }], paymentMethod: 'TRANSFER' });

    expect(res.status).toBe(200);
    expect(mockPrisma.cashMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-1' } });
  });
});

describe('GET /api/v1/purchases/check-invoice', () => {
  beforeEach(() => jest.clearAllMocks());

  it('responde duplicate:false si faltan supplierId o invoiceNumber', async () => {
    const res = await request(app)
      .get('/api/v1/purchases/check-invoice')
      .query({ supplierId: 'sup-1' })
      .set(authHeader('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ duplicate: false });
    expect(mockPrisma.purchase.findFirst).not.toHaveBeenCalled();
  });

  it('responde duplicate:true con los datos de la compra existente cuando ya hay una factura igual del mismo proveedor', async () => {
    (mockPrisma.purchase.findFirst as jest.Mock).mockResolvedValue({
      id: 'purch-1', purchaseDate: new Date('2026-07-01'), total: 50000,
    });

    const res = await request(app)
      .get('/api/v1/purchases/check-invoice')
      .query({ supplierId: 'sup-1', invoiceNumber: 'FAC-001' })
      .set(authHeader('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(true);
    expect(res.body.data.existing).toEqual(expect.objectContaining({ id: 'purch-1', total: 50000 }));
    expect(mockPrisma.purchase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          supplierId: 'sup-1',
          invoiceNumber: { equals: 'FAC-001', mode: 'insensitive' },
        }),
      })
    );
  });

  it('excluye la propia compra al editar (excludeId)', async () => {
    (mockPrisma.purchase.findFirst as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .get('/api/v1/purchases/check-invoice')
      .query({ supplierId: 'sup-1', invoiceNumber: 'FAC-001', excludeId: 'purch-1' })
      .set(authHeader('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(false);
    expect(mockPrisma.purchase.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 'purch-1' } }),
      })
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

  it('elimina el movimiento de caja si la compra se pagó en efectivo y la caja donde se registró sigue abierta', async () => {
    (mockPrisma.purchase.findFirst as jest.Mock).mockResolvedValue({
      id: 'purch-1',
      branchId: 'br-1',
      paymentMethod: 'CASH',
      details: [{ productId: PROD, quantity: 5, unitCost: 1000 }],
    });
    (mockPrisma.cashMovement.findFirst as jest.Mock).mockResolvedValue({ id: 'mov-1', cashRegister: { status: 'OPEN' } });

    const tx = {
      $queryRawUnsafe: jest.fn()
        .mockResolvedValueOnce([{ id: PROD, stock: 100, allowNegativeStock: false, name: 'Producto X' }])
        .mockResolvedValueOnce([{ stock: 20 }]),
      product: { update: jest.fn().mockResolvedValue({}) },
      productStock: { update: jest.fn().mockResolvedValue({}) },
      inventoryMovement: { create: jest.fn().mockResolvedValue({}) },
      purchase: { update: jest.fn().mockResolvedValue({}) },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .delete('/api/v1/purchases/purch-1')
      .set(authHeader('ADMIN', 'br-1'));

    expect(res.status).toBe(200);
    expect(mockPrisma.cashMovement.delete).toHaveBeenCalledWith({ where: { id: 'mov-1' } });
  });
});
