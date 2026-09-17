import { Response, NextFunction } from 'express';
import { advanceController } from '../../controllers/advance.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

// Anticipos: las reglas donde se mueve la plata.
//
// Lo que se protege aquí: que un anticipo no se pueda cruzar con la factura de
// otro cliente, que no se gaste más saldo del que hay, que devolver y anular no
// sean lo mismo, y que la caja se mueva en la dirección correcta (del cliente
// entra, al proveedor sale).

jest.mock('../../config/database', () => ({
  prisma: {
    advance: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn(), groupBy: jest.fn() },
    advanceApplication: { aggregate: jest.fn(), create: jest.fn() },
    customer: { findFirst: jest.fn() },
    supplier: { findFirst: jest.fn() },
    paymentAccount: { findFirst: jest.fn() },
    cashRegister: { findFirst: jest.fn() },
    cashMovement: { create: jest.fn() },
    sale: { findFirst: jest.fn() },
    purchase: { findFirst: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  cache: { get: jest.fn(), set: jest.fn(), del: jest.fn() },
}));

const mockPrisma = prisma as unknown as Record<string, any>;

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'a@b.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'br-1' },
    params: {}, query: {}, body: {},
    ...overrides,
  } as unknown as AuthRequest;
}

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json, status };
}

const next = jest.fn() as unknown as NextFunction;
const errorDe = (fn: jest.Mock) => (fn.mock.calls[fn.mock.calls.length - 1][0] as Error & { statusCode?: number });

const ANTICIPO = {
  id: 'ant-1', businessId: 'biz-1', number: 'ANT-0001', type: 'CUSTOMER',
  customerId: 'cli-1', supplierId: null, amount: 500000, applied: 0, balance: 500000,
  status: 'PENDING', paymentMethod: 'CASH', paymentAccountId: 'acct-efectivo',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.cashRegister.findFirst.mockResolvedValue({ id: 'caja-1' });
  mockPrisma.cashMovement.create.mockResolvedValue({});
});

// ─── Registrar ───────────────────────────────────────────────────────────────

describe('advanceController.create', () => {
  beforeEach(() => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: 'cli-1', name: 'Marta' });
    mockPrisma.supplier.findFirst.mockResolvedValue({ id: 'prov-1', name: 'Maderas SAS' });
    mockPrisma.paymentAccount.findFirst.mockResolvedValue({ id: 'acct-efectivo', legacyEnum: 'CASH' });
    mockPrisma.advance.count.mockResolvedValue(0);
    mockPrisma.advance.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ ...data, id: 'ant-nuevo', customer: { name: 'Marta' }, supplier: { name: 'Maderas SAS' } }));
  });

  it('el anticipo del cliente ENTRA a la caja', async () => {
    const { res } = makeRes();
    await advanceController.create(makeReq({
      body: { type: 'CUSTOMER', customerId: 'cli-1', amount: 500000, paymentAccountId: 'acct-efectivo' },
    }), res, next);

    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'IN', amount: 500000 }) }),
    );
  });

  it('el anticipo al proveedor SALE de la caja', async () => {
    mockPrisma.advance.count.mockResolvedValue(0);
    const { res } = makeRes();
    await advanceController.create(makeReq({
      body: { type: 'SUPPLIER', supplierId: 'prov-1', amount: 300000, paymentAccountId: 'acct-efectivo' },
    }), res, next);

    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OUT', amount: 300000 }) }),
    );
  });

  it('un anticipo por transferencia no toca la caja', async () => {
    mockPrisma.paymentAccount.findFirst.mockResolvedValue({ id: 'acct-banco', legacyEnum: 'TRANSFER' });
    const { res } = makeRes();
    await advanceController.create(makeReq({
      body: { type: 'CUSTOMER', customerId: 'cli-1', amount: 500000, paymentAccountId: 'acct-banco' },
    }), res, next);

    expect(mockPrisma.cashMovement.create).not.toHaveBeenCalled();
  });

  it('numera aparte los de cliente y los de proveedor', async () => {
    mockPrisma.advance.count.mockResolvedValue(3);
    const { res } = makeRes();
    await advanceController.create(makeReq({
      body: { type: 'SUPPLIER', supplierId: 'prov-1', amount: 1000, paymentAccountId: 'acct-efectivo' },
    }), res, next);

    expect(mockPrisma.advance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ number: 'ANTP-0004' }) }),
    );
  });

  it('exige el tercero: un anticipo sin dueño no se puede cruzar con nada', async () => {
    const { res } = makeRes();
    await advanceController.create(makeReq({ body: { type: 'CUSTOMER', amount: 500000 } }), res, next);

    expect(errorDe(next as unknown as jest.Mock).statusCode).toBe(400);
    expect(mockPrisma.advance.create).not.toHaveBeenCalled();
  });

  it('rechaza montos en cero o negativos', async () => {
    const { res } = makeRes();
    await advanceController.create(makeReq({
      body: { type: 'CUSTOMER', customerId: 'cli-1', amount: 0 },
    }), res, next);

    expect(errorDe(next as unknown as jest.Mock).statusCode).toBe(400);
  });

  it('no deja registrar un anticipo de un cliente de otro negocio', async () => {
    mockPrisma.customer.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    await advanceController.create(makeReq({
      body: { type: 'CUSTOMER', customerId: 'cli-ajeno', amount: 1000 },
    }), res, next);

    expect(errorDe(next as unknown as jest.Mock).statusCode).toBe(404);
  });
});

// ─── Cruzar contra una factura ───────────────────────────────────────────────

describe('advanceController.apply', () => {
  function prepararTx(anticipo = ANTICIPO, venta: any = { id: 'v-1', invoiceNumber: 'F-1', total: 200000, status: 'COMPLETED', customerId: 'cli-1' }) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: anticipo.id }]),
      advance: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(anticipo),
        update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ ...anticipo, ...data })),
      },
      advanceApplication: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        create: jest.fn().mockResolvedValue({}),
      },
      sale: { findFirst: jest.fn().mockResolvedValue(venta) },
      purchase: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
    return tx;
  }

  it('baja el saldo y deja el anticipo en PARCIAL', async () => {
    const tx = prepararTx();
    const { res } = makeRes();
    await advanceController.apply(makeReq({ params: { id: 'ant-1' }, body: { saleId: 'v-1', amount: 100000 } }), res, next);

    expect(tx.advance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ applied: 100000, balance: 400000, status: 'PARTIAL' }),
    }));
  });

  it('cruzarlo todo lo deja en APLICADO', async () => {
    const tx = prepararTx({ ...ANTICIPO, amount: 100000, balance: 100000 });
    const { res } = makeRes();
    await advanceController.apply(makeReq({ params: { id: 'ant-1' }, body: { saleId: 'v-1' } }), res, next);

    expect(tx.advance.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ balance: 0, status: 'APPLIED' }),
    }));
  });

  it('NO deja cruzarlo con la factura de otro cliente', async () => {
    // El caso que le regalaría la plata a quien no la puso.
    prepararTx(ANTICIPO, { id: 'v-2', total: 50000, status: 'COMPLETED', customerId: 'otro-cliente' });
    const { res } = makeRes();
    await advanceController.apply(makeReq({ params: { id: 'ant-1' }, body: { saleId: 'v-2' } }), res, next);

    expect(errorDe(next as unknown as jest.Mock).message).toContain('otro cliente');
  });

  it('no deja gastar más saldo del que hay', async () => {
    prepararTx({ ...ANTICIPO, balance: 1000 });
    const { res } = makeRes();
    await advanceController.apply(makeReq({ params: { id: 'ant-1' }, body: { saleId: 'v-1', amount: 5000 } }), res, next);

    expect(errorDe(next as unknown as jest.Mock).statusCode).toBe(400);
  });

  it('nunca cubre más de lo que vale la factura', async () => {
    // Anticipo de 500.000 sobre una factura de 200.000: se cruzan 200.000 y el
    // resto le queda al cliente para la próxima compra.
    const tx = prepararTx();
    const { res } = makeRes();
    await advanceController.apply(makeReq({ params: { id: 'ant-1' }, body: { saleId: 'v-1' } }), res, next);

    expect(tx.advanceApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 200000 }) }),
    );
  });

  it('no deja cruzar contra una venta anulada', async () => {
    prepararTx(ANTICIPO, { id: 'v-1', total: 200000, status: 'CANCELLED', customerId: 'cli-1' });
    const { res } = makeRes();
    await advanceController.apply(makeReq({ params: { id: 'ant-1' }, body: { saleId: 'v-1' } }), res, next);

    expect(errorDe(next as unknown as jest.Mock).statusCode).toBe(400);
  });

  it('un anticipo devuelto ya no se puede usar', async () => {
    prepararTx({ ...ANTICIPO, status: 'REFUNDED', balance: 0 });
    const { res } = makeRes();
    await advanceController.apply(makeReq({ params: { id: 'ant-1' }, body: { saleId: 'v-1' } }), res, next);

    expect(errorDe(next as unknown as jest.Mock).message).toContain('devuelto');
  });

  it('cruzar NO mueve la caja: esa plata entró el día del anticipo', async () => {
    prepararTx();
    const { res } = makeRes();
    await advanceController.apply(makeReq({ params: { id: 'ant-1' }, body: { saleId: 'v-1', amount: 1000 } }), res, next);

    expect(mockPrisma.cashMovement.create).not.toHaveBeenCalled();
  });
});

// ─── Devolver y anular ───────────────────────────────────────────────────────

describe('advanceController.refund', () => {
  it('devuelve el SALDO y saca la plata de la caja', async () => {
    // Ya se había cruzado una parte: esa mercancía se entregó y no se devuelve.
    mockPrisma.advance.findFirst.mockResolvedValue({ ...ANTICIPO, applied: 200000, balance: 300000, status: 'PARTIAL', customer: { name: 'Marta' } });
    mockPrisma.advance.update.mockResolvedValue({ ...ANTICIPO, balance: 0, status: 'REFUNDED' });

    const { res } = makeRes();
    await advanceController.refund(makeReq({ params: { id: 'ant-1' }, body: {} }), res, next);

    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OUT', amount: 300000 }) }),
    );
  });

  it('al proveedor la devolución ENTRA a la caja', async () => {
    mockPrisma.advance.findFirst.mockResolvedValue({
      ...ANTICIPO, type: 'SUPPLIER', customerId: null, supplierId: 'prov-1',
      supplier: { name: 'Maderas SAS' }, customer: null,
    });
    mockPrisma.advance.update.mockResolvedValue({});

    const { res } = makeRes();
    await advanceController.refund(makeReq({ params: { id: 'ant-1' }, body: {} }), res, next);

    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'IN' }) }),
    );
  });

  it('no se devuelve dos veces', async () => {
    mockPrisma.advance.findFirst.mockResolvedValue({ ...ANTICIPO, status: 'REFUNDED', balance: 0 });
    const { res } = makeRes();
    await advanceController.refund(makeReq({ params: { id: 'ant-1' }, body: {} }), res, next);

    expect(errorDe(next as unknown as jest.Mock).statusCode).toBe(400);
    expect(mockPrisma.cashMovement.create).not.toHaveBeenCalled();
  });

  it('un anticipo ya consumido no tiene nada que devolver', async () => {
    mockPrisma.advance.findFirst.mockResolvedValue({ ...ANTICIPO, applied: 500000, balance: 0, status: 'APPLIED' });
    const { res } = makeRes();
    await advanceController.refund(makeReq({ params: { id: 'ant-1' }, body: {} }), res, next);

    expect(errorDe(next as unknown as jest.Mock).statusCode).toBe(400);
  });

  it('se puede devolver por otro medio del que entró', async () => {
    mockPrisma.advance.findFirst.mockResolvedValue({ ...ANTICIPO, paymentMethod: 'TRANSFER', customer: { name: 'Marta' } });
    mockPrisma.advance.update.mockResolvedValue({});

    const { res } = makeRes();
    await advanceController.refund(makeReq({ params: { id: 'ant-1' }, body: { refundMethod: 'CASH' } }), res, next);

    // Entró por transferencia pero se devolvió en efectivo: sí mueve la caja.
    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OUT' }) }),
    );
  });
});

describe('advanceController.cancel', () => {
  it('anular revierte el movimiento de caja original', async () => {
    mockPrisma.advance.findFirst.mockResolvedValue({ ...ANTICIPO });
    mockPrisma.advance.update.mockResolvedValue({ ...ANTICIPO, status: 'CANCELLED' });

    const { res } = makeRes();
    await advanceController.cancel(makeReq({ params: { id: 'ant-1' }, body: {} }), res, next);

    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'OUT', amount: 500000 }) }),
    );
  });

  it('no se anula uno que ya se cruzó con una factura', async () => {
    mockPrisma.advance.findFirst.mockResolvedValue({ ...ANTICIPO, applied: 100000, balance: 400000, status: 'PARTIAL' });
    const { res } = makeRes();
    await advanceController.cancel(makeReq({ params: { id: 'ant-1' }, body: {} }), res, next);

    expect(errorDe(next as unknown as jest.Mock).statusCode).toBe(400);
    expect(mockPrisma.advance.update).not.toHaveBeenCalled();
  });
});

// ─── Saldo disponible ────────────────────────────────────────────────────────

describe('advanceController.available', () => {
  it('suma el saldo a favor del cliente, del más viejo al más nuevo', async () => {
    mockPrisma.advance.findMany.mockResolvedValue([
      { id: 'a1', number: 'ANT-0001', amount: 500000, balance: 300000 },
      { id: 'a2', number: 'ANT-0002', amount: 100000, balance: 100000 },
    ]);

    const { res, json } = makeRes();
    await advanceController.available(makeReq({ query: { customerId: 'cli-1' } }), res, next);

    expect(json.mock.calls[0][0].data.total).toBe(400000);
    expect(mockPrisma.advance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
  });

  it('solo cuenta los que todavía tienen saldo', async () => {
    mockPrisma.advance.findMany.mockResolvedValue([]);
    const { res } = makeRes();
    await advanceController.available(makeReq({ query: { customerId: 'cli-1' } }), res, next);

    expect(mockPrisma.advance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ['PENDING', 'PARTIAL'] } }) }),
    );
  });

  it('sin tercero no responde nada', async () => {
    const { res } = makeRes();
    await advanceController.available(makeReq({ query: {} }), res, next);

    expect(errorDe(next as unknown as jest.Mock).statusCode).toBe(400);
  });
});

// ─── Buscador ────────────────────────────────────────────────────────────────

describe('advanceController.list — buscador', () => {
  beforeEach(() => {
    mockPrisma.advance.findMany.mockResolvedValue([]);
    mockPrisma.advance.count.mockResolvedValue(0);
    mockPrisma.advance.groupBy.mockResolvedValue([]);
  });

  const whereUsado = () => mockPrisma.advance.findMany.mock.calls[0][0].where;

  it('con una cédula escrita con puntos busca por los dígitos', async () => {
    // La gente escribe "1.085.248.963"; en la base está "1085248963".
    const { res } = makeRes();
    await advanceController.list(makeReq({ query: { search: '1.085.248.963' } }), res, next);

    const or = whereUsado().OR as Array<Record<string, unknown>>;
    expect(or).toEqual(expect.arrayContaining([
      { customer: { document: { contains: '1085248963' } } },
      { supplier: { document: { contains: '1085248963' } } },
    ]));
  });

  it('con solo texto NO agrega la condición de identificación', async () => {
    // `contains: ''` emparejaría con todos los terceros: la búsqueda por nombre
    // devolvería la lista completa.
    const { res } = makeRes();
    await advanceController.list(makeReq({ query: { search: 'Marta' } }), res, next);

    const or = whereUsado().OR as Array<Record<string, unknown>>;
    expect(or.some((c) => 'customer' in c && 'document' in (c.customer as object))).toBe(false);
    expect(or).toEqual(expect.arrayContaining([
      { number: { contains: 'Marta', mode: 'insensitive' } },
      { customer: { name: { contains: 'Marta', mode: 'insensitive' } } },
    ]));
  });

  it('el consecutivo se busca tal cual', async () => {
    const { res } = makeRes();
    await advanceController.list(makeReq({ query: { search: 'ANT-0012' } }), res, next);

    const or = whereUsado().OR as Array<Record<string, unknown>>;
    expect(or).toEqual(expect.arrayContaining([{ number: { contains: 'ANT-0012', mode: 'insensitive' } }]));
  });

  it('informa cuánto hay pendiente de cruzar por tipo', async () => {
    mockPrisma.advance.groupBy.mockResolvedValue([
      { type: 'CUSTOMER', _sum: { balance: 750000 } },
      { type: 'SUPPLIER', _sum: { balance: 120000 } },
    ]);
    const { res, json } = makeRes();
    await advanceController.list(makeReq({ query: {} }), res, next);

    expect(json.mock.calls[0][0].saldosPendientes).toEqual({ CUSTOMER: 750000, SUPPLIER: 120000 });
  });
});

// ─── El Excel del reporte ────────────────────────────────────────────────────
//
// Se arma el archivo DE VERDAD (ExcelJS escribiendo sobre un stream) y se lee de
// vuelta: así se prueba lo que el usuario descarga, no una llamada simulada.
describe('advanceController.exportar', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PassThrough } = require('stream');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ExcelJS = require('exceljs');

  function resStream() {
    const stream = new PassThrough();
    stream.headers = {} as Record<string, string>;
    stream.setHeader = jest.fn((k: string, v: string) => { stream.headers[k] = v; });
    const trozos: Buffer[] = [];
    stream.on('data', (t: Buffer) => trozos.push(t));
    // La promesa se crea AQUÍ, antes de generar el archivo: si se esperara
    // después, el stream ya habría terminado y el 'end' nunca llegaría.
    const terminado = new Promise<void>((resolve) => stream.on('end', () => resolve()));
    return { stream, terminado, buffer: () => Buffer.concat(trozos) };
  }

  const ANTICIPO_PROV = {
    id: 'ant-p', number: 'ANTP-0001', type: 'SUPPLIER', amount: 1200000, applied: 0,
    balance: 1200000, status: 'PENDING', paymentMethod: 'CASH', notes: 'pedido madera',
    createdAt: new Date('2026-09-10T15:00:00Z'), refundedAt: null,
    customer: null, supplier: { id: 'prov-1', name: 'Maderas del Valle', document: '900123456', phone: '3001112233' },
    paymentAccount: { id: 'acct-efectivo', name: 'Efectivo' },
    createdBy: { id: 'u-1', name: 'Cristian' },
    applications: [],
  };

  it('la pestaña de proveedores pide SOLO los de proveedor', async () => {
    mockPrisma.advance.findMany.mockResolvedValue([]);
    const { stream } = resStream();
    await advanceController.exportar(
      makeReq({ query: { type: 'SUPPLIER' } }), stream as unknown as Response, next,
    );

    expect(mockPrisma.advance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ type: 'SUPPLIER' }) }),
    );
  });

  it('el archivo se llama por la pestaña que se está viendo', async () => {
    mockPrisma.advance.findMany.mockResolvedValue([]);
    const { stream } = resStream();
    await advanceController.exportar(
      makeReq({ query: { type: 'SUPPLIER' } }), stream as unknown as Response, next,
    );

    expect(stream.headers['Content-Disposition']).toMatch(/anticipos-proveedores-\d{4}-\d{2}-\d{2}\.xlsx/);
  });

  it('el Excel trae al proveedor con su NIT, su saldo y el TOTAL', async () => {
    mockPrisma.advance.findMany.mockResolvedValue([ANTICIPO_PROV]);
    const { stream, terminado, buffer } = resStream();
    await advanceController.exportar(
      makeReq({ query: { type: 'SUPPLIER' } }), stream as unknown as Response, next,
    );
    await terminado;

    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wb.xlsx.load as any)(buffer());
    const ws = wb.worksheets[0];
    const filas: unknown[][] = [];
    ws.eachRow((r: { values: unknown }, i: number) => { if (i > 1) filas.push(r.values as unknown[]); });

    const fila = filas[0];
    expect(fila[1]).toBe('ANTP-0001');
    expect(fila[2]).toBe('Proveedor');
    expect(fila[3]).toBe('Maderas del Valle');
    expect(fila[4]).toBe('900123456');
    expect(fila[9]).toBe(1200000); // saldo
    // La fila final suma, que es lo que el contador mira primero.
    expect(filas[filas.length - 1][1]).toBe('TOTAL');
    expect(filas[filas.length - 1][9]).toBe(1200000);
  });

  it('los filtros de la pantalla viajan al Excel', async () => {
    mockPrisma.advance.findMany.mockResolvedValue([]);
    const { stream } = resStream();
    await advanceController.exportar(
      makeReq({ query: { type: 'SUPPLIER', status: 'PENDING', search: '900.123.456' } }),
      stream as unknown as Response, next,
    );

    const where = mockPrisma.advance.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('SUPPLIER');
    expect(where.status).toBe('PENDING');
    expect(where.OR).toEqual(expect.arrayContaining([
      { supplier: { document: { contains: '900123456' } } },
    ]));
  });
});
