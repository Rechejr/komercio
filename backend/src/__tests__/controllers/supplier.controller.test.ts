import { Response, NextFunction } from 'express';
import { supplierController } from '../../controllers/supplier.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

jest.mock('../../config/database', () => ({
  prisma: {
    supplier: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

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

describe('supplierController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna proveedores paginados del negocio', async () => {
    const suppliers = [{ id: 's1', name: 'Proveedor A', contactName: null }];
    (mockPrisma.supplier.findMany as jest.Mock).mockResolvedValue(suppliers);
    (mockPrisma.supplier.count as jest.Mock).mockResolvedValue(1);

    const { res, json } = makeRes();
    await supplierController.list(makeReq(), res, next);

    expect(mockPrisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, businessId: 'biz-1' }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── getOne ──────────────────────────────────────────────────────────────────

describe('supplierController.getOne', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando el proveedor no existe', async () => {
    (mockPrisma.supplier.findFirst as jest.Mock).mockResolvedValue(null);
    await supplierController.getOne(makeReq({ params: { id: 's-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('retorna el proveedor con sus relaciones', async () => {
    const supplier = { id: 's1', name: 'Proveedor A', products: [], purchases: [] };
    (mockPrisma.supplier.findFirst as jest.Mock).mockResolvedValue(supplier);

    const { res, json } = makeRes();
    await supplierController.getOne(makeReq({ params: { id: 's1' } }), res, next);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('supplierController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('crea el proveedor y retorna 201', async () => {
    const supplier = { id: 's1', name: 'Nuevo Proveedor' };
    (mockPrisma.supplier.create as jest.Mock).mockResolvedValue(supplier);

    const { res, json } = makeRes();
    await supplierController.create(makeReq({ body: { name: 'Nuevo Proveedor' } }), res, next);

    expect(mockPrisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ businessId: 'biz-1' }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('supplierController.update', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando el proveedor no existe', async () => {
    (mockPrisma.supplier.findFirst as jest.Mock).mockResolvedValue(null);
    await supplierController.update(makeReq({ params: { id: 's-x' }, body: { name: 'X' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('actualiza el proveedor y retorna los datos actualizados', async () => {
    (mockPrisma.supplier.findFirst as jest.Mock).mockResolvedValue({ id: 's1' });
    (mockPrisma.supplier.update as jest.Mock).mockResolvedValue({ id: 's1', name: 'Actualizado' });

    const { res, json } = makeRes();
    await supplierController.update(makeReq({ params: { id: 's1' }, body: { name: 'Actualizado' } }), res, next);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe('supplierController.delete', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 cuando el proveedor no existe', async () => {
    (mockPrisma.supplier.findFirst as jest.Mock).mockResolvedValue(null);
    await supplierController.delete(makeReq({ params: { id: 's-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('hace soft-delete del proveedor', async () => {
    (mockPrisma.supplier.findFirst as jest.Mock).mockResolvedValue({ id: 's1' });
    (mockPrisma.supplier.update as jest.Mock).mockResolvedValue({});

    const { res, json } = makeRes();
    await supplierController.delete(makeReq({ params: { id: 's1' } }), res, next);

    expect(mockPrisma.supplier.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});