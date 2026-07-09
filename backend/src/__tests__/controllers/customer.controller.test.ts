import { Response, NextFunction } from 'express';
import { customerController } from '../../controllers/customer.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

jest.mock('../../config/database', () => {
  const prismaMock: any = {
    customer: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    sale: { findMany: jest.fn(), count: jest.fn() },
    business: { findUnique: jest.fn().mockResolvedValue({ plan: 'pro', planExpiresAt: null }) },
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    // create() corre dentro de $transaction para el chequeo atómico del límite
    // de plan — el mock invoca el callback pasándole el mismo objeto mockeado.
    $transaction: jest.fn((cb: any) => cb(prismaMock)),
  };
  return { prisma: prismaMock };
});

jest.mock('../../utils/pagination', () => ({
  getPagination: jest.fn().mockReturnValue({ page: 1, limit: 20, skip: 0 }),
  getSearch: jest.fn().mockReturnValue(undefined),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

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

// ─── list ────────────────────────────────────────────────────────────────────

describe('customerController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna clientes paginados del negocio', async () => {
    const customers = [{ id: 'c1', name: 'Juan Pérez', creditBalance: 0 }];
    (mockPrisma.customer.findMany as jest.Mock).mockResolvedValue(customers);
    (mockPrisma.customer.count as jest.Mock).mockResolvedValue(1);

    const { res, json } = makeRes();
    await customerController.list(makeReq(), res, next);

    expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, businessId: 'biz-1' }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('filtra por hasDebt=true cuando se provee', async () => {
    (mockPrisma.customer.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.customer.count as jest.Mock).mockResolvedValue(0);

    await customerController.list(makeReq({ query: { hasDebt: 'true' } }), makeRes().res, next);

    expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ currentDebt: { gt: 0 } }),
      })
    );
  });
});

// ─── getOne ──────────────────────────────────────────────────────────────────

describe('customerController.getOne', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando el cliente no existe', async () => {
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    await customerController.getOne(makeReq({ params: { id: 'c-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('retorna el cliente con sus relaciones', async () => {
    const customer = { id: 'c1', name: 'Juan', credits: [], sales: [] };
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(customer);

    const { res, json } = makeRes();
    await customerController.getOne(makeReq({ params: { id: 'c1' } }), res, next);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('customerController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('crea el cliente y retorna 201', async () => {
    const customer = { id: 'c1', name: 'Cliente Nuevo' };
    (mockPrisma.customer.create as jest.Mock).mockResolvedValue(customer);

    const { res, json } = makeRes();
    await customerController.create(makeReq({ body: { name: 'Cliente Nuevo' } }), res, next);

    expect(mockPrisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessId: 'biz-1' }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('customerController.update', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando el cliente no existe', async () => {
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    await customerController.update(makeReq({ params: { id: 'c-x' }, body: { name: 'X' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('actualiza el cliente correctamente', async () => {
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' });
    (mockPrisma.customer.update as jest.Mock).mockResolvedValue({ id: 'c1', name: 'Actualizado' });

    const { res, json } = makeRes();
    await customerController.update(makeReq({ params: { id: 'c1' }, body: { name: 'Actualizado' } }), res, next);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe('customerController.delete', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando el cliente no existe', async () => {
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    await customerController.delete(makeReq({ params: { id: 'c-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('hace soft-delete del cliente', async () => {
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' });
    (mockPrisma.customer.update as jest.Mock).mockResolvedValue({});

    const { res, json } = makeRes();
    await customerController.delete(makeReq({ params: { id: 'c1' } }), res, next);

    expect(mockPrisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── getPurchaseHistory ───────────────────────────────────────────────────────

describe('customerController.getPurchaseHistory', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando el cliente no existe', async () => {
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(null);
    await customerController.getPurchaseHistory(makeReq({ params: { id: 'c-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('retorna el historial de compras del cliente', async () => {
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' });
    const sales = [{ id: 'sal1', total: 50000, details: [] }];
    (mockPrisma.sale.findMany as jest.Mock).mockResolvedValue(sales);
    (mockPrisma.sale.count as jest.Mock).mockResolvedValue(1);

    const { res, json } = makeRes();
    await customerController.getPurchaseHistory(makeReq({ params: { id: 'c1' } }), res, next);

    expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: 'c1' }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});