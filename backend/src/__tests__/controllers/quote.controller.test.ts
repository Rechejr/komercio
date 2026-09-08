import { Response, NextFunction } from 'express';
import { quoteController } from '../../controllers/quote.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

// Lo que más importa aquí: los totales se calculan SIEMPRE en el servidor a
// partir de los ítems (nunca se confía en lo que mande el frontend) y toda
// consulta va filtrada por businessId — una cotización de otro negocio no debe
// poder verse, convertirse ni borrarse.

jest.mock('../../config/database', () => ({
  prisma: {
    quote: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    customer: { findFirst: jest.fn() },
  },
}));

jest.mock('../../utils/pagination', () => ({
  getPagination: jest.fn().mockReturnValue({ page: 1, limit: 20, skip: 0 }),
}));

const mockPrisma = prisma as any;

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

function makeNext() {
  return jest.fn() as unknown as NextFunction;
}

function errorDe(next: NextFunction) {
  const mock = next as unknown as jest.Mock;
  expect(mock).toHaveBeenCalledTimes(1);
  return mock.mock.calls[0][0] as { message: string; statusCode: number };
}

beforeEach(() => jest.clearAllMocks());

// ─── list ────────────────────────────────────────────────────────────────────

describe('quoteController.list', () => {
  it('devuelve solo cuántos ítems tiene cada cotización, no el detalle', async () => {
    mockPrisma.quote.findMany.mockResolvedValue([
      { id: 'q1', number: 'COT-0001', total: 1000, items: [{ name: 'A' }, { name: 'B' }] },
    ]);
    mockPrisma.quote.count.mockResolvedValue(1);
    const { res, json } = makeRes();

    await quoteController.list(makeReq(), res, makeNext());

    const fila = json.mock.calls[0][0].data[0];
    expect(fila.itemCount).toBe(2);
    expect(fila.items).toBeUndefined();
  });

  it('filtra por negocio y por estado cuando se pide', async () => {
    mockPrisma.quote.findMany.mockResolvedValue([]);
    mockPrisma.quote.count.mockResolvedValue(0);
    const { res } = makeRes();

    await quoteController.list(makeReq({ query: { status: 'CONVERTED' } }), res, makeNext());

    expect(mockPrisma.quote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'biz-1', deletedAt: null, status: 'CONVERTED' } }),
    );
  });
});

// ─── getOne ──────────────────────────────────────────────────────────────────

describe('quoteController.getOne', () => {
  it('404 si la cotización es de otro negocio o no existe', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await quoteController.getOne(makeReq({ params: { id: 'q-ajena' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.quote.findFirst).toHaveBeenCalledWith({
      where: { id: 'q-ajena', businessId: 'biz-1', deletedAt: null },
    });
  });

  it('agrega el teléfono del cliente para el envío por WhatsApp', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'q1', customerId: 'c1', total: 5000 });
    mockPrisma.customer.findFirst.mockResolvedValue({ phone: '3001234567' });
    const { res, json } = makeRes();

    await quoteController.getOne(makeReq({ params: { id: 'q1' } }), res, makeNext());

    expect(json.mock.calls[0][0].data.customerPhone).toBe('3001234567');
  });

  it('deja el teléfono en null si la cotización no tiene cliente guardado', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'q1', customerId: null });
    const { res, json } = makeRes();

    await quoteController.getOne(makeReq({ params: { id: 'q1' } }), res, makeNext());

    expect(mockPrisma.customer.findFirst).not.toHaveBeenCalled();
    expect(json.mock.calls[0][0].data.customerPhone).toBeNull();
  });
});

// ─── create ──────────────────────────────────────────────────────────────────

describe('quoteController.create', () => {
  it.each([
    ['sin ítems', { items: [] }],
    ['con ítem sin nombre', { items: [{ name: '  ', quantity: 1, unitPrice: 100 }] }],
    ['con cantidad en cero', { items: [{ name: 'Camisa', quantity: 0, unitPrice: 100 }] }],
    ['con cantidad negativa', { items: [{ name: 'Camisa', quantity: -2, unitPrice: 100 }] }],
    ['con precio negativo', { items: [{ name: 'Camisa', quantity: 1, unitPrice: -1 }] }],
  ])('rechaza una cotización %s', async (_caso, body) => {
    const { res } = makeRes();
    const next = makeNext();

    await quoteController.create(makeReq({ body }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.quote.create).not.toHaveBeenCalled();
  });

  it('calcula los totales en el servidor e ignora los que mande el cliente', async () => {
    mockPrisma.quote.count.mockResolvedValue(0);
    mockPrisma.quote.create.mockResolvedValue({ id: 'q1' });
    const { res } = makeRes();

    await quoteController.create(makeReq({
      body: {
        // 2 × $1.000 con 10% de descuento y 19% de IVA.
        items: [{ name: 'Camisa', quantity: 2, unitPrice: 1000, discountPct: 10, taxRate: 19 }],
        subtotal: 1, total: 1, taxAmount: 1, discountAmount: 1, // valores mentirosos del cliente
      },
    }), res, makeNext());

    const data = mockPrisma.quote.create.mock.calls[0][0].data;
    expect(data.subtotal).toBe(2000);
    expect(data.discountAmount).toBe(200);
    expect(data.taxAmount).toBeCloseTo(342, 5);
    expect(data.total).toBeCloseTo(2142, 5);
  });

  it('trata como cero los descuentos e impuestos que no vengan', async () => {
    mockPrisma.quote.count.mockResolvedValue(0);
    mockPrisma.quote.create.mockResolvedValue({ id: 'q1' });
    const { res } = makeRes();

    await quoteController.create(makeReq({
      body: { items: [{ name: 'Pantalón', quantity: 3, unitPrice: 5000 }] },
    }), res, makeNext());

    const data = mockPrisma.quote.create.mock.calls[0][0].data;
    expect(data.discountAmount).toBe(0);
    expect(data.taxAmount).toBe(0);
    expect(data.total).toBe(15000);
  });

  it('numera correlativo por negocio con ceros a la izquierda', async () => {
    mockPrisma.quote.count.mockResolvedValue(11);
    mockPrisma.quote.create.mockResolvedValue({ id: 'q12' });
    const { res, status } = makeRes();

    await quoteController.create(makeReq({
      body: { items: [{ name: 'Camisa', quantity: 1, unitPrice: 100 }] },
    }), res, makeNext());

    // El conteo incluye las borradas para no reutilizar números.
    expect(mockPrisma.quote.count).toHaveBeenCalledWith({ where: { businessId: 'biz-1' } });
    expect(mockPrisma.quote.create.mock.calls[0][0].data.number).toBe('COT-0012');
    expect(status).toHaveBeenCalledWith(201);
  });

  it('guarda la cotización con el negocio y el autor del token', async () => {
    mockPrisma.quote.count.mockResolvedValue(0);
    mockPrisma.quote.create.mockResolvedValue({ id: 'q1' });
    const { res } = makeRes();

    await quoteController.create(makeReq({
      body: { items: [{ name: 'Camisa', quantity: 1, unitPrice: 100 }], validUntil: '2026-09-30' },
    }), res, makeNext());

    const data = mockPrisma.quote.create.mock.calls[0][0].data;
    expect(data.businessId).toBe('biz-1');
    expect(data.createdById).toBe('u-1');
    expect(data.validUntil).toBeInstanceOf(Date);
  });
});

// ─── markConverted / remove ──────────────────────────────────────────────────

describe('quoteController.update', () => {
  // Modificar una cotización: el cliente pidió otra cantidad o cambió un precio.
  // Antes tocaba borrarla y hacerla de nuevo, con número nuevo.
  const items = [{ name: 'Café', quantity: 5, unitPrice: 10000, discountPct: 10, taxRate: 0 }];

  it('404 si la cotización es de otro negocio', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue(null);
    const next = makeNext();

    await quoteController.update(makeReq({ params: { id: 'q-ajena' }, body: { items } }), makeRes().res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.quote.update).not.toHaveBeenCalled();
  });

  it('409 si ya se convirtió en venta', async () => {
    // Editarla dejaría el papel que tiene el cliente diciendo una cosa y la
    // venta registrada otra.
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'q-1', status: 'CONVERTED' });
    const next = makeNext();

    await quoteController.update(makeReq({ params: { id: 'q-1' }, body: { items } }), makeRes().res, next);

    expect(errorDe(next).statusCode).toBe(409);
    expect(mockPrisma.quote.update).not.toHaveBeenCalled();
  });

  it('recalcula los totales en el servidor, ignorando lo que mande el navegador', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'q-1', status: 'PENDING' });
    mockPrisma.quote.update.mockResolvedValue({ id: 'q-1' });

    await quoteController.update(
      // El navegador manda un total de 1 peso a propósito.
      makeReq({ params: { id: 'q-1' }, body: { items, total: 1, subtotal: 1 } }),
      makeRes().res, makeNext(),
    );

    const data = mockPrisma.quote.update.mock.calls[0][0].data;
    expect(data.subtotal).toBe(50000);        // 5 x 10.000
    expect(data.discountAmount).toBe(5000);   // 10%
    expect(data.total).toBe(45000);
  });

  it('no cambia el número: el cliente ya tiene ese papel', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'q-1', status: 'PENDING' });
    mockPrisma.quote.update.mockResolvedValue({ id: 'q-1' });

    await quoteController.update(makeReq({ params: { id: 'q-1' }, body: { items } }), makeRes().res, makeNext());

    expect(mockPrisma.quote.update.mock.calls[0][0].data.number).toBeUndefined();
  });

  it('rechaza una cotización sin productos', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'q-1', status: 'PENDING' });
    const next = makeNext();

    await quoteController.update(makeReq({ params: { id: 'q-1' }, body: { items: [] } }), makeRes().res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.quote.update).not.toHaveBeenCalled();
  });

  it('rechaza cantidades en cero o negativas', async () => {
    mockPrisma.quote.findFirst.mockResolvedValue({ id: 'q-1', status: 'PENDING' });
    const next = makeNext();

    await quoteController.update(
      makeReq({ params: { id: 'q-1' }, body: { items: [{ name: 'X', quantity: 0, unitPrice: 100 }] } }),
      makeRes().res, next,
    );

    expect(errorDe(next).statusCode).toBe(400);
  });
});

describe('quoteController.list · búsqueda y fechas', () => {
  beforeEach(() => {
    mockPrisma.quote.findMany.mockResolvedValue([]);
    mockPrisma.quote.count.mockResolvedValue(0);
  });

  it('busca por número o por nombre de cliente', async () => {
    await quoteController.list(makeReq({ query: { search: 'Marta' } }), makeRes().res, makeNext());

    const where = mockPrisma.quote.findMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { number: { contains: 'Marta', mode: 'insensitive' } },
      { customerName: { contains: 'Marta', mode: 'insensitive' } },
    ]);
  });

  it('el rango de fechas se ancla al día colombiano', async () => {
    await quoteController.list(
      makeReq({ query: { startDate: '2026-09-01', endDate: '2026-09-30' } }),
      makeRes().res, makeNext(),
    );

    const where = mockPrisma.quote.findMany.mock.calls[0][0].where;
    // Medianoche de Bogotá = 05:00 UTC. Sin esto, lo del día 1 antes de las
    // 7 p.m. quedaba por fuera del rango.
    expect(where.createdAt.gte.toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(where.createdAt.lte.toISOString()).toBe('2026-10-01T04:59:59.999Z');
  });

  it('sin filtros no arma condiciones de más', async () => {
    await quoteController.list(makeReq(), makeRes().res, makeNext());

    const where = mockPrisma.quote.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeUndefined();
    expect(where.createdAt).toBeUndefined();
  });
});

describe('quoteController.markConverted', () => {
  it('marca como convertida solo dentro del negocio del token', async () => {
    mockPrisma.quote.updateMany.mockResolvedValue({ count: 1 });
    const { res, json } = makeRes();

    await quoteController.markConverted(makeReq({ params: { id: 'q1' } }), res, makeNext());

    expect(mockPrisma.quote.updateMany).toHaveBeenCalledWith({
      where: { id: 'q1', businessId: 'biz-1', deletedAt: null },
      data: { status: 'CONVERTED' },
    });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('404 si no tocó ninguna fila (cotización ajena o borrada)', async () => {
    mockPrisma.quote.updateMany.mockResolvedValue({ count: 0 });
    const { res } = makeRes();
    const next = makeNext();

    await quoteController.markConverted(makeReq({ params: { id: 'q-ajena' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
  });
});

describe('quoteController.remove', () => {
  it('borra en suave con fecha, no elimina la fila', async () => {
    mockPrisma.quote.updateMany.mockResolvedValue({ count: 1 });
    const { res } = makeRes();

    await quoteController.remove(makeReq({ params: { id: 'q1' } }), res, makeNext());

    const llamada = mockPrisma.quote.updateMany.mock.calls[0][0];
    expect(llamada.where).toEqual({ id: 'q1', businessId: 'biz-1', deletedAt: null });
    expect(llamada.data.deletedAt).toBeInstanceOf(Date);
  });

  it('404 si la cotización no es de este negocio', async () => {
    mockPrisma.quote.updateMany.mockResolvedValue({ count: 0 });
    const { res } = makeRes();
    const next = makeNext();

    await quoteController.remove(makeReq({ params: { id: 'q-ajena' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
  });
});
