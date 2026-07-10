import { Response, NextFunction } from 'express';
import { creditController } from '../../controllers/credit.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';
import { AppError } from '../../utils/response';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../config/database', () => ({
  prisma: {
    credit: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    customer: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    creditPayment: { create: jest.fn() },
    cashRegister: { findFirst: jest.fn() },
    cashMovement: { create: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../../config/socket', () => ({
  emitToBusinesss: jest.fn(),
  socketEvents: { PAYMENT_RECEIVED: 'payment:received', CREDIT_UPDATED: 'credit:updated' },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { userId: 'user-1', email: 'u@test.com', role: 'ADMIN', businessId: 'biz-1' },
    params: {},
    query: {},
    body: {},
    ...overrides,
  } as unknown as AuthRequest;
}

function makeRes(): { res: Response; json: jest.Mock; status: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const res = { json, status, cookie: jest.fn() } as unknown as Response;
  return { res, json, status };
}

const next = jest.fn() as unknown as NextFunction;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('creditController.list', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna créditos paginados del negocio', async () => {
    const credits = [{ id: 'c1', totalAmount: 100000, balance: 50000, status: 'PARTIAL' }];
    (mockPrisma.credit.findMany as jest.Mock).mockResolvedValue(credits);
    (mockPrisma.credit.count as jest.Mock).mockResolvedValue(1);

    const req = makeReq({ query: {} });
    const { res, json } = makeRes();

    await creditController.list(req, res, next);

    expect(mockPrisma.credit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) })
    );
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('filtra por status cuando se pasa en la query', async () => {
    (mockPrisma.credit.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.credit.count as jest.Mock).mockResolvedValue(0);

    const req = makeReq({ query: { status: 'OVERDUE' } });
    const { res } = makeRes();

    await creditController.list(req, res, next);

    expect(mockPrisma.credit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'OVERDUE' }) })
    );
  });

  it('filtra por customerId cuando se pasa en la query', async () => {
    (mockPrisma.credit.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.credit.count as jest.Mock).mockResolvedValue(0);

    const req = makeReq({ query: { customerId: 'cust-99' } });
    const { res } = makeRes();

    await creditController.list(req, res, next);

    expect(mockPrisma.credit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customerId: 'cust-99' }) })
    );
  });
});

describe('creditController.create', () => {
  beforeEach(() => jest.clearAllMocks());

  it('llama next con 404 cuando el cliente no existe', async () => {
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(null);

    const req = makeReq({ body: { customerId: 'cust-99', totalAmount: '50000', dueDate: null } });
    const { res } = makeRes();

    await creditController.create(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('crea el crédito y actualiza la deuda del cliente', async () => {
    const customer = { id: 'cust-1', name: 'Juan' };
    (mockPrisma.customer.findFirst as jest.Mock).mockResolvedValue(customer);

    const newCredit = { id: 'credit-1', totalAmount: 100000, balance: 100000, status: 'PENDING' };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) =>
      fn({
        credit: { create: jest.fn().mockResolvedValue(newCredit) },
        customer: { update: jest.fn().mockResolvedValue({}) },
      })
    );

    const req = makeReq({ body: { customerId: 'cust-1', totalAmount: '100000', dueDate: '2026-12-31', notes: 'Nota' } });
    const { res, json } = makeRes();

    await creditController.create(req, res, next);

    expect(mockPrisma.$transaction).toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('creditController.addPayment', () => {
  beforeEach(() => jest.clearAllMocks());

  it('llama next con 400 cuando el monto es 0', async () => {
    const req = makeReq({ params: { id: 'credit-1' }, body: { amount: '0', paymentMethod: 'CASH' } });
    const { res } = makeRes();

    await creditController.addPayment(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('llama next con 400 cuando el monto es negativo', async () => {
    const req = makeReq({ params: { id: 'credit-1' }, body: { amount: '-5000', paymentMethod: 'CASH' } });
    const { res } = makeRes();

    await creditController.addPayment(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('registra el pago parcial y retorna el balance actualizado', async () => {
    const lockedCredit = { id: 'credit-1', totalAmount: 100000, paidAmount: 0, balance: 100000, status: 'PENDING', customerId: 'cust-1' };

    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([lockedCredit]),
        creditPayment: { create: jest.fn().mockResolvedValue({}) },
        credit: { update: jest.fn().mockResolvedValue({}) },
        customer: {
          findUnique: jest.fn().mockResolvedValue({ currentDebt: 100000 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    const req = makeReq({ params: { id: 'credit-1' }, body: { amount: '30000', paymentMethod: 'CASH' } });
    const { res, json } = makeRes();

    await creditController.addPayment(req, res, next);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    const responseData = json.mock.calls[0][0].data;
    expect(responseData.newBalance).toBe(70000);
    expect(responseData.status).toBe('PARTIAL');
  });

  it('marca el crédito como PAID cuando el pago salda el balance completo', async () => {
    const lockedCredit = { id: 'credit-1', totalAmount: 50000, paidAmount: 0, balance: 50000, status: 'PENDING', customerId: 'cust-1' };

    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([lockedCredit]),
        creditPayment: { create: jest.fn().mockResolvedValue({}) },
        credit: { update: jest.fn().mockResolvedValue({}) },
        customer: {
          findUnique: jest.fn().mockResolvedValue({ currentDebt: 50000 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    const req = makeReq({ params: { id: 'credit-1' }, body: { amount: '50000', paymentMethod: 'TRANSFER' } });
    const { res, json } = makeRes();

    await creditController.addPayment(req, res, next);

    const responseData = json.mock.calls[0][0].data;
    expect(responseData.newBalance).toBe(0);
    expect(responseData.status).toBe('PAID');
  });

  it('llama next con 400 cuando el pago supera el balance', async () => {
    const lockedCredit = { id: 'credit-1', totalAmount: 50000, paidAmount: 0, balance: 50000, status: 'PENDING', customerId: 'cust-1' };

    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([lockedCredit]),
        creditPayment: { create: jest.fn() },
        credit: { update: jest.fn() },
        customer: { findUnique: jest.fn(), update: jest.fn() },
      };
      return fn(tx);
    });

    const req = makeReq({ params: { id: 'credit-1' }, body: { amount: '99999', paymentMethod: 'CASH' } });
    const { res } = makeRes();

    await creditController.addPayment(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
    expect((next as jest.Mock).mock.calls[0][0].message).toMatch(/supera el saldo/i);
  });

  it('llama next con 400 cuando el crédito ya está saldado', async () => {
    const paidCredit = { id: 'credit-1', totalAmount: 50000, paidAmount: 50000, balance: 0, status: 'PAID', customerId: 'cust-1' };

    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = { $queryRaw: jest.fn().mockResolvedValue([paidCredit]) };
      return fn(tx);
    });

    const req = makeReq({ params: { id: 'credit-1' }, body: { amount: '1000', paymentMethod: 'CASH' } });
    const { res } = makeRes();

    await creditController.addPayment(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('crea un movimiento de caja IN cuando el abono es en efectivo y hay una caja abierta', async () => {
    const lockedCredit = { id: 'credit-1', totalAmount: 100000, paidAmount: 0, balance: 100000, status: 'PENDING', customerId: 'cust-1' };

    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([lockedCredit]),
        creditPayment: { create: jest.fn().mockResolvedValue({}) },
        credit: { update: jest.fn().mockResolvedValue({}) },
        customer: {
          findUnique: jest.fn().mockResolvedValue({ currentDebt: 100000, name: 'Juan Pérez' }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
    (mockPrisma.cashRegister.findFirst as jest.Mock).mockResolvedValue({ id: 'reg-1' });
    (mockPrisma.cashMovement.create as jest.Mock).mockResolvedValue({});

    const req = makeReq({ params: { id: 'credit-1' }, body: { amount: '30000', paymentMethod: 'CASH' }, user: { userId: 'user-1', email: 'u@test.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'branch-1' } });
    const { res } = makeRes();

    await creditController.addPayment(req, res, next);

    expect(mockPrisma.cashRegister.findFirst).toHaveBeenCalledWith({ where: { branchId: 'branch-1', status: 'OPEN' } });
    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith({
      data: {
        cashRegisterId: 'reg-1',
        type: 'IN',
        amount: 30000,
        description: 'Abono de crédito — Juan Pérez',
        referenceId: 'credit-1',
      },
    });
  });

  it('no crea movimiento de caja cuando el abono no es en efectivo', async () => {
    const lockedCredit = { id: 'credit-1', totalAmount: 100000, paidAmount: 0, balance: 100000, status: 'PENDING', customerId: 'cust-1' };

    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([lockedCredit]),
        creditPayment: { create: jest.fn().mockResolvedValue({}) },
        credit: { update: jest.fn().mockResolvedValue({}) },
        customer: {
          findUnique: jest.fn().mockResolvedValue({ currentDebt: 100000, name: 'Juan Pérez' }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });

    const req = makeReq({ params: { id: 'credit-1' }, body: { amount: '30000', paymentMethod: 'TRANSFER' }, user: { userId: 'user-1', email: 'u@test.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'branch-1' } });
    const { res } = makeRes();

    await creditController.addPayment(req, res, next);

    expect(mockPrisma.cashRegister.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.cashMovement.create).not.toHaveBeenCalled();
  });
});