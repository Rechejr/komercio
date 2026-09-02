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
        // Fiado sin plan de cuotas: la lista viene vacía y el abono va al saldo.
        creditInstallment: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
        },
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
        // Fiado sin plan de cuotas: la lista viene vacía y el abono va al saldo.
        creditInstallment: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
        },
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
        // Fiado sin plan de cuotas: la lista viene vacía y el abono va al saldo.
        creditInstallment: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
        },
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
        createdById: 'user-1',
      },
    });
  });

  it('no crea movimiento de caja cuando el abono no es en efectivo', async () => {
    const lockedCredit = { id: 'credit-1', totalAmount: 100000, paidAmount: 0, balance: 100000, status: 'PENDING', customerId: 'cust-1' };

    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([lockedCredit]),
        creditPayment: { create: jest.fn().mockResolvedValue({}) },
        // Fiado sin plan de cuotas: la lista viene vacía y el abono va al saldo.
        creditInstallment: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn().mockResolvedValue({}),
        },
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

// ─── cancel ──────────────────────────────────────────────────────────────────

describe('creditController.cancel', () => {
  beforeEach(() => jest.clearAllMocks());

  it('anula un crédito manual: revierte el saldo pendiente del cliente y marca CANCELLED', async () => {
    const lockedCredit = { id: 'credit-1', status: 'PARTIAL', balance: 40000, customerId: 'cust-1', saleId: null };
    const txCustomerUpdate = jest.fn().mockResolvedValue({});
    const txCreditUpdate = jest.fn().mockResolvedValue({});
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([lockedCredit]),
        customer: { update: txCustomerUpdate },
        credit: { update: txCreditUpdate },
      };
      return fn(tx);
    });

    const { res, json } = makeRes();
    await creditController.cancel(makeReq({ params: { id: 'credit-1' } }), res, next);

    expect(txCustomerUpdate).toHaveBeenCalledWith({
      where: { id: 'cust-1' },
      data: { currentDebt: { decrement: 40000 } },
    });
    expect(txCreditUpdate).toHaveBeenCalledWith({
      where: { id: 'credit-1' },
      data: { status: 'CANCELLED', balance: 0 },
    });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 404 cuando el crédito no existe (o no pertenece al negocio)', async () => {
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = { $queryRaw: jest.fn().mockResolvedValue([]) };
      return fn(tx);
    });

    await creditController.cancel(makeReq({ params: { id: 'credit-x' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
  });

  it('rechaza con 400 si el crédito ya está saldado', async () => {
    const lockedCredit = { id: 'credit-1', status: 'PAID', balance: 0, customerId: 'cust-1', saleId: null };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = { $queryRaw: jest.fn().mockResolvedValue([lockedCredit]) };
      return fn(tx);
    });

    await creditController.cancel(makeReq({ params: { id: 'credit-1' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('rechaza con 400 si el crédito ya está anulado', async () => {
    const lockedCredit = { id: 'credit-1', status: 'CANCELLED', balance: 0, customerId: 'cust-1', saleId: null };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = { $queryRaw: jest.fn().mockResolvedValue([lockedCredit]) };
      return fn(tx);
    });

    await creditController.cancel(makeReq({ params: { id: 'credit-1' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('rechaza con 400 si el crédito está ligado a una venta (debe anularse desde Ventas)', async () => {
    const lockedCredit = { id: 'credit-1', status: 'PENDING', balance: 50000, customerId: 'cust-1', saleId: 'sale-1' };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = { $queryRaw: jest.fn().mockResolvedValue([lockedCredit]) };
      return fn(tx);
    });

    await creditController.cancel(makeReq({ params: { id: 'credit-1' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });
});
// ─── Fecha de pago del fiado ─────────────────────────────────────────────────
// Sin fecha, un fiado NUNCA entra en mora ni dispara avisos: el proceso que los
// marca busca por dueDate. Los fiados hechos desde el POS nacían sin ella, así
// que toda esa maquinaria estaba apagada para el caso más común.
describe('creditController.updateDueDate', () => {
  beforeEach(() => jest.clearAllMocks());

  const credito = (extra: Record<string, unknown> = {}) => ({
    id: 'credit-1', status: 'PENDING', ...extra,
  });

  it('guarda la fecha de pago del fiado', async () => {
    (mockPrisma.credit.findFirst as jest.Mock).mockResolvedValue(credito());
    (mockPrisma.credit.update as jest.Mock).mockResolvedValue({ id: 'credit-1' });

    const { res, json } = makeRes();
    await creditController.updateDueDate(
      makeReq({ params: { id: 'credit-1' }, body: { dueDate: '2026-10-15' } }), res, next,
    );

    const data = (mockPrisma.credit.update as jest.Mock).mock.calls[0][0].data;
    expect(data.dueDate).toBeInstanceOf(Date);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('con la fecha vacía la quita (fiado sin plazo)', async () => {
    (mockPrisma.credit.findFirst as jest.Mock).mockResolvedValue(credito());
    (mockPrisma.credit.update as jest.Mock).mockResolvedValue({ id: 'credit-1' });

    const { res } = makeRes();
    await creditController.updateDueDate(
      makeReq({ params: { id: 'credit-1' }, body: { dueDate: null } }), res, next,
    );

    expect((mockPrisma.credit.update as jest.Mock).mock.calls[0][0].data.dueDate).toBeNull();
  });

  it('al dar un plazo nuevo hacia adelante, deja de estar en mora', async () => {
    // Si no, quedaría "En mora" con una fecha futura —que no tiene sentido— y
    // le seguiría saliendo al dueño en los avisos de cobro.
    (mockPrisma.credit.findFirst as jest.Mock).mockResolvedValue(credito({ status: 'OVERDUE' }));
    (mockPrisma.credit.update as jest.Mock).mockResolvedValue({ id: 'credit-1' });
    const enUnMes = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const { res } = makeRes();
    await creditController.updateDueDate(
      makeReq({ params: { id: 'credit-1' }, body: { dueDate: enUnMes } }), res, next,
    );

    expect((mockPrisma.credit.update as jest.Mock).mock.calls[0][0].data.status).toBe('PENDING');
  });

  it('un plazo en el PASADO no lo saca de mora', async () => {
    (mockPrisma.credit.findFirst as jest.Mock).mockResolvedValue(credito({ status: 'OVERDUE' }));
    (mockPrisma.credit.update as jest.Mock).mockResolvedValue({ id: 'credit-1' });
    const hace10dias = new Date(Date.now() - 10 * 86_400_000).toISOString();

    const { res } = makeRes();
    await creditController.updateDueDate(
      makeReq({ params: { id: 'credit-1' }, body: { dueDate: hace10dias } }), res, next,
    );

    expect((mockPrisma.credit.update as jest.Mock).mock.calls[0][0].data.status).toBeUndefined();
  });

  it('404 si el fiado es de otro negocio', async () => {
    (mockPrisma.credit.findFirst as jest.Mock).mockResolvedValue(null);

    await creditController.updateDueDate(
      makeReq({ params: { id: 'ajeno' }, body: { dueDate: '2026-10-15' } }), makeRes().res, next,
    );

    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(404);
    // La consulta va acotada al negocio del token, por el cliente dueño del fiado.
    expect((mockPrisma.credit.findFirst as jest.Mock).mock.calls[0][0].where.customer)
      .toEqual({ businessId: 'biz-1' });
  });

  it.each([
    ['anulado', 'CANCELLED'],
    ['ya saldado', 'PAID'],
  ])('rechaza cambiar la fecha de un fiado %s', async (_caso, status) => {
    (mockPrisma.credit.findFirst as jest.Mock).mockResolvedValue(credito({ status }));

    await creditController.updateDueDate(
      makeReq({ params: { id: 'credit-1' }, body: { dueDate: '2026-10-15' } }), makeRes().res, next,
    );

    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
    expect(mockPrisma.credit.update).not.toHaveBeenCalled();
  });

  it('rechaza una fecha basura', async () => {
    await creditController.updateDueDate(
      makeReq({ params: { id: 'credit-1' }, body: { dueDate: 'el proximo mes' } }), makeRes().res, next,
    );

    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });
});

// ─── Abonos contra un plan de cuotas ─────────────────────────────────────────
// El negocio pidió que el cliente elija a QUÉ cuota abona. Si el abono alcanza
// para más, el excedente sigue por las siguientes: dejar dinero sin asignar
// haría que la suma de las cuotas no cuadre nunca con el saldo del fiado.
describe('creditController.addPayment — con cuotas', () => {
  beforeEach(() => jest.clearAllMocks());

  const fiado = { id: 'credit-1', totalAmount: 864000, paidAmount: 0, balance: 864000, status: 'PENDING', customerId: 'cust-1' };

  /** Arma el tx con un plan de 4 cuotas de $216.000 y devuelve los espías. */
  function conPlan(cuotas = [
    { id: 'c1', numero: 1, monto: 216000, paidAmount: 0 },
    { id: 'c2', numero: 2, monto: 216000, paidAmount: 0 },
    { id: 'c3', numero: 3, monto: 216000, paidAmount: 0 },
    { id: 'c4', numero: 4, monto: 216000, paidAmount: 0 },
  ]) {
    const cuotaUpdate = jest.fn().mockResolvedValue({});
    const creditUpdate = jest.fn().mockResolvedValue({});
    const pagoCreate = jest.fn().mockResolvedValue({});
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn({
      $queryRaw: jest.fn().mockResolvedValue([fiado]),
      creditPayment: { create: pagoCreate },
      credit: { update: creditUpdate },
      creditInstallment: {
        findMany: jest.fn().mockResolvedValue(cuotas),
        findFirst: jest.fn().mockResolvedValue({ dueDate: new Date('2026-11-15') }),
        update: cuotaUpdate,
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue({ currentDebt: 864000, name: 'Yolardy' }),
        update: jest.fn().mockResolvedValue({}),
      },
    }));
    return { cuotaUpdate, creditUpdate, pagoCreate };
  }

  it('aplica el abono a la cuota que eligió el cliente, no a la primera', async () => {
    const { cuotaUpdate } = conPlan();

    await creditController.addPayment(
      makeReq({ params: { id: 'credit-1' }, body: { amount: 216000, installmentId: 'c3' } }),
      makeRes().res, next,
    );

    // La 3 quedó pagada y no se tocó ninguna otra.
    expect(cuotaUpdate).toHaveBeenCalledTimes(1);
    expect(cuotaUpdate).toHaveBeenCalledWith({
      where: { id: 'c3' },
      data: { paidAmount: 216000, status: 'PAID' },
    });
  });

  it('un abono menor deja la cuota en parcial', async () => {
    const { cuotaUpdate } = conPlan();

    await creditController.addPayment(
      makeReq({ params: { id: 'credit-1' }, body: { amount: 100000, installmentId: 'c1' } }),
      makeRes().res, next,
    );

    expect(cuotaUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { paidAmount: 100000, status: 'PARTIAL' },
    });
  });

  it('lo que sobra pasa a la siguiente cuota, no se pierde', async () => {
    const { cuotaUpdate } = conPlan();

    // Paga $300.000: cubre la cuota 1 ($216.000) y abona $84.000 a la 2.
    await creditController.addPayment(
      makeReq({ params: { id: 'credit-1' }, body: { amount: 300000, installmentId: 'c1' } }),
      makeRes().res, next,
    );

    expect(cuotaUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: 'c1' }, data: { paidAmount: 216000, status: 'PAID' },
    });
    expect(cuotaUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: 'c2' }, data: { paidAmount: 84000, status: 'PARTIAL' },
    });
  });

  it('respeta lo ya abonado antes en esa cuota', async () => {
    const { cuotaUpdate } = conPlan([
      { id: 'c1', numero: 1, monto: 216000, paidAmount: 150000 },
      { id: 'c2', numero: 2, monto: 216000, paidAmount: 0 },
    ]);

    await creditController.addPayment(
      makeReq({ params: { id: 'credit-1' }, body: { amount: 66000, installmentId: 'c1' } }),
      makeRes().res, next,
    );

    // 150.000 que ya tenía + 66.000 = 216.000 → queda saldada.
    expect(cuotaUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' }, data: { paidAmount: 216000, status: 'PAID' },
    });
  });

  it('sin elegir cuota, abona a la más antigua sin pagar', async () => {
    const { cuotaUpdate } = conPlan();

    await creditController.addPayment(
      makeReq({ params: { id: 'credit-1' }, body: { amount: 216000 } }),
      makeRes().res, next,
    );

    expect(cuotaUpdate).toHaveBeenCalledWith({
      where: { id: 'c1' }, data: { paidAmount: 216000, status: 'PAID' },
    });
  });

  it('mueve la fecha del fiado a la próxima cuota sin pagar', async () => {
    // De ahí salen los avisos y el estado "En mora": si no se moviera, el fiado
    // seguiría "venciendo" en la fecha de una cuota ya pagada.
    const { creditUpdate } = conPlan();

    await creditController.addPayment(
      makeReq({ params: { id: 'credit-1' }, body: { amount: 216000, installmentId: 'c1' } }),
      makeRes().res, next,
    );

    expect(creditUpdate).toHaveBeenCalledWith({
      where: { id: 'credit-1' },
      data: { dueDate: new Date('2026-11-15') },
    });
  });

  it('guarda a qué cuota se aplicó el abono', async () => {
    const { pagoCreate } = conPlan();

    await creditController.addPayment(
      makeReq({ params: { id: 'credit-1' }, body: { amount: 216000, installmentId: 'c2' } }),
      makeRes().res, next,
    );

    expect(pagoCreate.mock.calls[0][0].data.installmentId).toBe('c2');
  });

  it('rechaza abonar a una cuota de otro fiado', async () => {
    conPlan();

    await creditController.addPayment(
      makeReq({ params: { id: 'credit-1' }, body: { amount: 100000, installmentId: 'cuota-ajena' } }),
      makeRes().res, next,
    );

    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });
});
