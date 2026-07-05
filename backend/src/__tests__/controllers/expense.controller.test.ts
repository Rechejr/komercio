import { Response, NextFunction } from 'express';
import { expenseController } from '../../controllers/expense.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';
import { AppError } from '../../utils/response';

jest.mock('../../config/database', () => ({
  prisma: {
    expense: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    expenseCategory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    cashRegister: { findFirst: jest.fn() },
    cashMovement: { create: jest.fn() },
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

describe('expenseController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna gastos paginados del negocio', async () => {
    const expenses = [{ id: 'e1', description: 'Arriendo', amount: 500000 }];
    (mockPrisma.expense.findMany as jest.Mock).mockResolvedValue(expenses);
    (mockPrisma.expense.count as jest.Mock).mockResolvedValue(1);

    const { res, json } = makeRes();
    await expenseController.list(makeReq(), res, next);

    expect(mockPrisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null, businessId: 'biz-1' }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('filtra por categoryId cuando se provee', async () => {
    (mockPrisma.expense.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.expense.count as jest.Mock).mockResolvedValue(0);

    await expenseController.list(makeReq({ query: { categoryId: 'cat-1' } }), makeRes().res, next);

    expect(mockPrisma.expense.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ categoryId: 'cat-1' }) })
    );
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('expenseController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('llama next con 400 cuando el monto es 0', async () => {
    await expenseController.create(makeReq({ body: { amount: '0', description: 'Test' } }), makeRes().res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('llama next con 400 cuando el monto es negativo', async () => {
    await expenseController.create(makeReq({ body: { amount: '-100', description: 'Test' } }), makeRes().res, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('crea el gasto y retorna 201', async () => {
    const expense = { id: 'e1', description: 'Internet', amount: 80000 };
    (mockPrisma.expense.create as jest.Mock).mockResolvedValue(expense);

    const { res, json } = makeRes();
    await expenseController.create(
      makeReq({ body: { description: 'Internet', amount: '80000', paymentMethod: 'TRANSFER' } }),
      res,
      next,
    );

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('no falla la venta si el movimiento de caja falla', async () => {
    const expense = { id: 'e1', description: 'Gasto', amount: 50000 };
    (mockPrisma.expense.create as jest.Mock).mockResolvedValue(expense);
    (mockPrisma.cashRegister.findFirst as jest.Mock).mockRejectedValue(new Error('redis down'));

    const { res, json } = makeRes();
    await expenseController.create(
      makeReq({ body: { description: 'Gasto', amount: '50000', paymentMethod: 'CASH' } }),
      res,
      next,
    );

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── update ──────────────────────────────────────────────────────────────────

describe('expenseController.update', () => {
  beforeEach(() => jest.clearAllMocks());

  it('llama next con 404 cuando el gasto no existe', async () => {
    (mockPrisma.expense.findFirst as jest.Mock).mockResolvedValue(null);
    await expenseController.update(makeReq({ params: { id: 'e-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('llama next con 400 cuando el nuevo monto es 0', async () => {
    (mockPrisma.expense.findFirst as jest.Mock).mockResolvedValue({ id: 'e1' });
    await expenseController.update(
      makeReq({ params: { id: 'e1' }, body: { amount: '0' } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('actualiza el gasto correctamente', async () => {
    (mockPrisma.expense.findFirst as jest.Mock).mockResolvedValue({ id: 'e1' });
    (mockPrisma.expense.update as jest.Mock).mockResolvedValue({ id: 'e1', description: 'Nuevo' });

    const { res, json } = makeRes();
    await expenseController.update(
      makeReq({ params: { id: 'e1' }, body: { description: 'Nuevo', amount: '90000' } }),
      res,
      next,
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── delete ──────────────────────────────────────────────────────────────────

describe('expenseController.delete', () => {
  beforeEach(() => jest.clearAllMocks());

  it('llama next con 404 cuando el gasto no existe', async () => {
    (mockPrisma.expense.findFirst as jest.Mock).mockResolvedValue(null);
    await expenseController.delete(makeReq({ params: { id: 'e-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('hace soft-delete del gasto', async () => {
    (mockPrisma.expense.findFirst as jest.Mock).mockResolvedValue({ id: 'e1' });
    (mockPrisma.expense.update as jest.Mock).mockResolvedValue({});

    const { res, json } = makeRes();
    await expenseController.delete(makeReq({ params: { id: 'e1' } }), res, next);

    expect(mockPrisma.expense.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});