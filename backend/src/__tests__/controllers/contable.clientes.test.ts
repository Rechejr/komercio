import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { contableController } from '../../controllers/contable.controller';
import { prisma } from '../../config/database';
import { calcularDV } from '../../utils/nit';
import { AuthRequest } from '../../middlewares/auth';

// Clientes de Ventrix Contable (TaxClient). Dos riesgos que se prueban aquí:
// que un contador alcance clientes de OTRA oficina (todo pasa por
// getClientOfBusiness) y que al cambiar las calidades de un cliente su agenda
// de vencimientos quede desincronizada.
//
// Los utils de NIT y calidades se usan REALES (no mockeados): el dígito de
// verificación y las combinaciones prohibidas son justo lo que hay que validar.

jest.mock('../../config/database', () => {
  const prismaMock: any = {
    taxClient: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    vencimiento: { deleteMany: jest.fn(), createMany: jest.fn() },
    calendarioDian: { findMany: jest.fn().mockResolvedValue([]) },
    calendarioRentaNatural: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((cb: any) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
  };
  return { prisma: prismaMock };
});

jest.mock('../../utils/pagination', () => ({
  getPagination: jest.fn().mockReturnValue({ page: 1, limit: 20, skip: 0 }),
  getSearch: jest.fn().mockReturnValue(undefined),
}));

jest.mock('../../config/cloudinary', () => ({
  uploadDocument: jest.fn(),
  deleteImage: jest.fn(),
}));

const mockPrisma = prisma as any;

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'conta@x.com', role: 'ADMIN', businessId: 'ofi-1', branchId: 'br-1' },
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

const clienteBase = {
  id: 'tc-1',
  businessId: 'ofi-1',
  razonSocial: 'Panadería El Trigo SAS',
  nit: '900123456',
  tipoPersona: 'juridica',
  responsabilidades: ['declarante_renta'],
  ivaPeriodicidad: null,
};

// Cuerpo válido para crear/actualizar; cada test cambia lo que necesita.
function body(extra: Record<string, unknown> = {}) {
  return {
    razonSocial: 'Panadería El Trigo SAS',
    nit: '900.123.456-7',
    tipoPersona: 'juridica',
    responsabilidades: ['declarante_renta'],
    ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.calendarioDian.findMany.mockResolvedValue([]);
  mockPrisma.calendarioRentaNatural.findUnique.mockResolvedValue(null);
});

// ─── listClients ─────────────────────────────────────────────────────────────

describe('contableController.listClients', () => {
  it('lista solo los clientes activos de la oficina del token', async () => {
    mockPrisma.taxClient.findMany.mockResolvedValue([clienteBase]);
    mockPrisma.taxClient.count.mockResolvedValue(1);
    const { res, json } = makeRes();

    await contableController.listClients(makeReq(), res, makeNext());

    expect(mockPrisma.taxClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'ofi-1', activo: true } }),
    );
    expect(json.mock.calls[0][0].pagination.total).toBe(1);
  });

  it('busca por razón social y, a la vez, por NIT', async () => {
    mockPrisma.taxClient.findMany.mockResolvedValue([]);
    mockPrisma.taxClient.count.mockResolvedValue(0);
    const { res } = makeRes();

    await contableController.listClients(makeReq({ query: { search: 'trigo' } }), res, makeNext());

    const where = mockPrisma.taxClient.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ razonSocial: { contains: 'trigo', mode: 'insensitive' } });
  });

  it('encuentra el NIT aunque lo peguen del RUT, con puntos y DV', async () => {
    mockPrisma.taxClient.findMany.mockResolvedValue([]);
    mockPrisma.taxClient.count.mockResolvedValue(0);
    const { res } = makeRes();

    await contableController.listClients(makeReq({ query: { search: '900.123.456-7' } }), res, makeNext());

    // El NIT se guarda sin el DV, así que la búsqueda tiene que ir sin él:
    // con el DV pegado ("9001234567") no encontraría a nadie.
    expect(mockPrisma.taxClient.findMany.mock.calls[0][0].where.OR).toContainEqual({
      nit: { contains: '900123456' },
    });
  });

  it('sin texto de búsqueda no arma filtro OR', async () => {
    mockPrisma.taxClient.findMany.mockResolvedValue([]);
    mockPrisma.taxClient.count.mockResolvedValue(0);
    const { res } = makeRes();

    await contableController.listClients(makeReq({ query: { search: '   ' } }), res, makeNext());

    expect(mockPrisma.taxClient.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });
});

// ─── createClient ────────────────────────────────────────────────────────────

describe('contableController.createClient', () => {
  it.each([
    ['sin razón social', body({ razonSocial: '  ' })],
    ['sin NIT', body({ nit: '' })],
    ['con un NIT que no trae dígitos', body({ nit: 'ABC-XYZ' })],
    ['con tipo de persona inválido', body({ tipoPersona: 'mixta' })],
    ['sin tipo de persona', body({ tipoPersona: undefined })],
  ])('rechaza el cliente %s', async (_caso, cuerpo) => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createClient(makeReq({ body: cuerpo }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.taxClient.create).not.toHaveBeenCalled();
  });

  it('guarda el NIT sin puntos y con su dígito de verificación', async () => {
    mockPrisma.taxClient.create.mockResolvedValue(clienteBase);
    const { res, status } = makeRes();

    await contableController.createClient(makeReq({ body: body({ nit: '900.123.456' }) }), res, makeNext());

    const data = mockPrisma.taxClient.create.mock.calls[0][0].data;
    expect(data.nit).toBe('900123456'); // sin puntos
    // El DV se calcula sobre el NIT ya limpio, no sobre el texto crudo.
    expect(data.dv).toBe(calcularDV('900123456'));
    expect(data.businessId).toBe('ofi-1');
    expect(status).toHaveBeenCalledWith(201);
  });

  // El NIT escrito con el DV es el caso más común (así sale del RUT). Si el DV
  // entrara al número, el último dígito —clave del calendario DIAN— quedaría mal.
  it('separa el DV cuando el NIT viene con guion', async () => {
    mockPrisma.taxClient.create.mockResolvedValue(clienteBase);
    const { res } = makeRes();

    await contableController.createClient(makeReq({ body: body({ nit: '900.123.456-7' }) }), res, makeNext());

    const data = mockPrisma.taxClient.create.mock.calls[0][0].data;
    expect(data.nit).toBe('900123456'); // sin el DV adentro
    expect(data.dv).toBe(calcularDV('900123456'));
  });

  it('una cédula de 10 dígitos sin guion se respeta entera', async () => {
    mockPrisma.taxClient.create.mockResolvedValue(clienteBase);
    const { res } = makeRes();

    await contableController.createClient(makeReq({
      body: body({ nit: '1020304050', tipoPersona: 'natural' }),
    }), res, makeNext());

    // Sin guion no se puede adivinar un DV: el número va completo.
    expect(mockPrisma.taxClient.create.mock.calls[0][0].data.nit).toBe('1020304050');
  });

  it('ignora la periodicidad de IVA si el cliente no es responsable de IVA', async () => {
    mockPrisma.taxClient.create.mockResolvedValue(clienteBase);
    const { res } = makeRes();

    await contableController.createClient(makeReq({
      body: body({ responsabilidades: ['declarante_renta'], ivaPeriodicidad: 'bimestral' }),
    }), res, makeNext());

    expect(mockPrisma.taxClient.create.mock.calls[0][0].data.ivaPeriodicidad).toBeNull();
  });

  it('conserva la periodicidad cuando sí es responsable de IVA', async () => {
    mockPrisma.taxClient.create.mockResolvedValue(clienteBase);
    const { res } = makeRes();

    await contableController.createClient(makeReq({
      body: body({ responsabilidades: ['responsable_iva'], ivaPeriodicidad: 'cuatrimestral' }),
    }), res, makeNext());

    expect(mockPrisma.taxClient.create.mock.calls[0][0].data.ivaPeriodicidad).toBe('cuatrimestral');
  });

  it('descarta una periodicidad de IVA que no existe', async () => {
    mockPrisma.taxClient.create.mockResolvedValue(clienteBase);
    const { res } = makeRes();

    await contableController.createClient(makeReq({
      body: body({ responsabilidades: ['responsable_iva'], ivaPeriodicidad: 'mensual' }),
    }), res, makeNext());

    expect(mockPrisma.taxClient.create.mock.calls[0][0].data.ivaPeriodicidad).toBeNull();
  });

  it('limpia las calidades imposibles: con Régimen Simple no hay renta ni retención', async () => {
    mockPrisma.taxClient.create.mockResolvedValue(clienteBase);
    const { res } = makeRes();

    await contableController.createClient(makeReq({
      body: body({ responsabilidades: ['rst', 'declarante_renta', 'agente_retenedor', 'inventado'] }),
    }), res, makeNext());

    expect(mockPrisma.taxClient.create.mock.calls[0][0].data.responsabilidades).toEqual(['rst']);
  });

  it('avisa con 409 si ya existe un cliente con ese NIT en la oficina', async () => {
    mockPrisma.taxClient.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5' }),
    );
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createClient(makeReq({ body: body() }), res, next);

    const err = errorDe(next);
    expect(err.statusCode).toBe(409);
    expect(err.message).toContain('NIT');
  });
});

// ─── updateClient ────────────────────────────────────────────────────────────

describe('contableController.updateClient', () => {
  it('404 si el cliente es de otra oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateClient(makeReq({ params: { id: 'tc-ajeno' }, body: body() }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    // La barrera consulta SIEMPRE con el businessId del token.
    expect(mockPrisma.taxClient.findFirst).toHaveBeenCalledWith({
      where: { id: 'tc-ajeno', businessId: 'ofi-1' },
    });
    expect(mockPrisma.taxClient.update).not.toHaveBeenCalled();
  });

  it('borra los vencimientos de una obligación que el cliente ya no tiene', async () => {
    // Antes declaraba renta; ahora solo es responsable de IVA.
    mockPrisma.taxClient.findFirst.mockResolvedValue({ ...clienteBase, responsabilidades: ['declarante_renta'] });
    mockPrisma.taxClient.update.mockResolvedValue({ ...clienteBase, id: 'tc-1' });
    mockPrisma.calendarioDian.findMany.mockResolvedValue([{ periodo: 'Bimestre 1', fecha: new Date('2026-03-10') }]);
    const { res } = makeRes();

    await contableController.updateClient(makeReq({
      params: { id: 'tc-1' },
      body: body({ responsabilidades: ['responsable_iva'], ivaPeriodicidad: 'bimestral' }),
    }), res, makeNext());

    expect(mockPrisma.vencimiento.deleteMany).toHaveBeenCalledWith({
      where: { taxClientId: 'tc-1', obligacion: { in: ['renta'] } },
    });
    // Y agrega los de la obligación nueva.
    expect(mockPrisma.vencimiento.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    const creados = mockPrisma.vencimiento.createMany.mock.calls[0][0].data;
    // anio: a que calendario pertenece — sin el, el mismo periodo del año
    // siguiente chocaria con este y se saltaria en silencio.
    expect(creados[0]).toEqual({
      taxClientId: 'tc-1', obligacion: 'iva', periodo: 'Bimestre 1',
      fecha: expect.any(Date), anio: expect.any(Number),
    });
  });

  it('no toca la agenda si las calidades no cambiaron', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue({ ...clienteBase, responsabilidades: ['declarante_renta'] });
    mockPrisma.taxClient.update.mockResolvedValue(clienteBase);
    const { res } = makeRes();

    await contableController.updateClient(makeReq({
      params: { id: 'tc-1' },
      body: body({ razonSocial: 'Panadería El Trigo SAS (nuevo nombre)', responsabilidades: ['declarante_renta'] }),
    }), res, makeNext());

    expect(mockPrisma.vencimiento.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.vencimiento.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.taxClient.update).toHaveBeenCalled();
  });

  it('valida el cuerpo aunque el cliente exista', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(clienteBase);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateClient(makeReq({ params: { id: 'tc-1' }, body: body({ razonSocial: '' }) }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.taxClient.update).not.toHaveBeenCalled();
  });

  it('409 si el NIT nuevo choca con otro cliente', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(clienteBase);
    mockPrisma.taxClient.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5' }),
    );
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateClient(makeReq({ params: { id: 'tc-1' }, body: body({ nit: '901000000' }) }), res, next);

    expect(errorDe(next).statusCode).toBe(409);
  });
});

// ─── deleteClient ────────────────────────────────────────────────────────────

describe('contableController.deleteClient', () => {
  it('no deja borrar un cliente de otra oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.deleteClient(makeReq({ params: { id: 'tc-ajeno' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.taxClient.delete).not.toHaveBeenCalled();
  });

  it('borra el cliente propio (la cascada se lleva su agenda)', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(clienteBase);
    const { res, json } = makeRes();

    await contableController.deleteClient(makeReq({ params: { id: 'tc-1' } }), res, makeNext());

    expect(mockPrisma.taxClient.delete).toHaveBeenCalledWith({ where: { id: 'tc-1' } });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
