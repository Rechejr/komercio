import { Response, NextFunction } from 'express';
import { searchController } from '../../controllers/search.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

// Buscador global (Ctrl+K). Dos cosas que no se pueden romper: el atajo "fiado",
// que lista los créditos pendientes en vez de buscar texto, y que TODAS las
// consultas queden encerradas en el businessId del token.

jest.mock('../../config/database', () => ({
  prisma: {
    customer: { findMany: jest.fn().mockResolvedValue([]) },
    product: { findMany: jest.fn().mockResolvedValue([]) },
    sale: { findMany: jest.fn().mockResolvedValue([]) },
    supplier: { findMany: jest.fn().mockResolvedValue([]) },
    credit: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

const mockPrisma = prisma as any;

function makeReq(q?: string): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'a@b.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'br-1' },
    params: {},
    query: q === undefined ? {} : { q },
    body: {},
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

beforeEach(() => {
  jest.clearAllMocks();
  for (const modelo of ['customer', 'product', 'sale', 'supplier', 'credit']) {
    mockPrisma[modelo].findMany.mockResolvedValue([]);
  }
});

describe('searchController.search', () => {
  it.each([[undefined], [''], ['a'], ['  b  ']])('rechaza búsquedas de menos de 2 caracteres (%s)', async (q) => {
    const { res } = makeRes();
    const next = makeNext();

    await searchController.search(makeReq(q), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.customer.findMany).not.toHaveBeenCalled();
  });

  it('busca en clientes, productos, ventas, proveedores y créditos a la vez', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([{ id: 'c1', name: 'Juan' }]);
    mockPrisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Jugo' }]);
    const { res, json } = makeRes();

    await searchController.search(makeReq('ju'), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.customers).toHaveLength(1);
    expect(data.products).toHaveLength(1);
    expect(data.isFiadoQuery).toBe(false);
  });

  it('encierra cada consulta en el negocio del token', async () => {
    const { res } = makeRes();

    await searchController.search(makeReq('juan'), res, makeNext());

    expect(mockPrisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: 'biz-1', deletedAt: null }) }),
    );
    expect(mockPrisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: 'biz-1' }) }),
    );
    // Las ventas cuelgan de la sucursal, así que el filtro va por la relación.
    expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ branch: { businessId: 'biz-1' } }) }),
    );
    expect(mockPrisma.supplier.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: 'biz-1' }) }),
    );
    expect(mockPrisma.credit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ customer: expect.objectContaining({ businessId: 'biz-1' }) }) }),
    );
  });

  it('busca sin distinguir mayúsculas y limita a 5 resultados por tipo', async () => {
    const { res } = makeRes();

    await searchController.search(makeReq('JuAn'), res, makeNext());

    const llamada = mockPrisma.customer.findMany.mock.calls[0][0];
    expect(llamada.take).toBe(5);
    expect(llamada.where.OR).toContainEqual({ name: { contains: 'JuAn', mode: 'insensitive' } });
    // También por documento y teléfono, para hallar al cliente como sea.
    expect(llamada.where.OR).toContainEqual({ document: { contains: 'JuAn', mode: 'insensitive' } });
    expect(llamada.where.OR).toContainEqual({ phone: { contains: 'JuAn', mode: 'insensitive' } });
  });

  it('recorta los espacios antes de buscar', async () => {
    const { res } = makeRes();

    await searchController.search(makeReq('  juan  '), res, makeNext());

    expect(mockPrisma.customer.findMany.mock.calls[0][0].where.OR[0]).toEqual({
      name: { contains: 'juan', mode: 'insensitive' },
    });
  });

  // ── atajo "fiado" ──────────────────────────────────────────────────────────

  it('"fiado" lista los créditos pendientes en vez de buscar texto', async () => {
    mockPrisma.credit.findMany.mockResolvedValue([{ id: 'cr1', balance: 50000, status: 'PENDING' }]);
    const { res, json } = makeRes();

    await searchController.search(makeReq('fiado'), res, makeNext());

    const llamada = mockPrisma.credit.findMany.mock.calls[0][0];
    expect(llamada.where.status).toEqual({ in: ['PENDING', 'PARTIAL', 'OVERDUE'] });
    expect(llamada.where.customer).toEqual({ businessId: 'biz-1', deletedAt: null });
    expect(llamada.orderBy).toEqual({ balance: 'desc' }); // el que más debe, primero

    const data = json.mock.calls[0][0].data;
    expect(data.isFiadoQuery).toBe(true);
    expect(data.credits).toHaveLength(1);
    // El atajo no gasta consultas en las demás tablas.
    expect(mockPrisma.customer.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.product.findMany).not.toHaveBeenCalled();
  });

  it('el atajo funciona escrito en mayúsculas', async () => {
    const { res, json } = makeRes();

    await searchController.search(makeReq('FIADO'), res, makeNext());

    expect(json.mock.calls[0][0].data.isFiadoQuery).toBe(true);
  });

  it('"fiados" (en plural) es una búsqueda normal, no el atajo', async () => {
    const { res, json } = makeRes();

    await searchController.search(makeReq('fiados'), res, makeNext());

    expect(json.mock.calls[0][0].data.isFiadoQuery).toBe(false);
    expect(mockPrisma.customer.findMany).toHaveBeenCalled();
  });

  it('propaga el error si la base de datos falla', async () => {
    mockPrisma.product.findMany.mockRejectedValue(new Error('conexión caída'));
    const { res } = makeRes();
    const next = makeNext();

    await searchController.search(makeReq('juan'), res, next);

    expect((next as unknown as jest.Mock)).toHaveBeenCalledWith(expect.any(Error));
  });
});
