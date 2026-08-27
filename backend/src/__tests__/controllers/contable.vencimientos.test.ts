import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { contableController } from '../../controllers/contable.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

// Agenda tributaria: es el producto entero de Ventrix Contable. Lo que se prueba
// aquí es que las fechas y montos que entran estén validados (un dato basura no
// puede reventar en 500), que la purga de cumplidos solo corra con el plan al
// día, y que ningún vencimiento de otra oficina se pueda tocar.

jest.mock('../../config/database', () => {
  const prismaMock: any = {
    taxClient: { findFirst: jest.fn(), findMany: jest.fn() },
    vencimiento: {
      findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(), createMany: jest.fn(), update: jest.fn(),
      delete: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
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

jest.mock('../../config/cloudinary', () => ({ uploadDocument: jest.fn(), deleteImage: jest.fn() }));

const mockPrisma = prisma as any;

const EN_UN_MES = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

// Año del calendario en uso (el mismo que lee el controlador del entorno).
const ANIO_ESPERADO = Number(process.env.ANIO_CALENDARIO) || 2026;

// El plan vigente habilita la escritura (y la purga); vencido deja todo en
// solo-lectura. requireContable deja planExpiresAt en el request.
function makeReq(overrides: Record<string, unknown> = {}): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'conta@x.com', role: 'ADMIN', businessId: 'ofi-1', branchId: 'br-1' },
    planExpiresAt: EN_UN_MES,
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

const cliente = {
  id: 'tc-1', businessId: 'ofi-1', razonSocial: 'Panadería El Trigo SAS',
  nit: '900123456', tipoPersona: 'juridica', ivaPeriodicidad: null,
  responsabilidades: ['declarante_renta'],
};

function bodyVenc(extra: Record<string, unknown> = {}) {
  return { taxClientId: 'tc-1', obligacion: 'renta', periodo: 'Año 2025', fecha: '2026-04-15', ...extra };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.taxClient.findFirst.mockResolvedValue(cliente);
  mockPrisma.vencimiento.findMany.mockResolvedValue([]);
  mockPrisma.vencimiento.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.calendarioDian.findMany.mockResolvedValue([]);
});

// ─── listVencimientos ────────────────────────────────────────────────────────

describe('contableController.listVencimientos', () => {
  it('purga los cumplidos de hace más de 2 meses cuando el plan está al día', async () => {
    const { res } = makeRes();

    await contableController.listVencimientos(makeReq(), res, makeNext());

    const where = mockPrisma.vencimiento.deleteMany.mock.calls[0][0].where;
    // "no aplica" también se purga: ya no requiere nada, igual que lo cumplido.
    expect(where.estado).toEqual({ in: ['presentada', 'pagada', 'no_aplica'] });
    expect(where.taxClient).toEqual({ businessId: 'ofi-1' });
    // Solo lo anterior al corte; lo pendiente o vencido nunca se borra.
    expect(where.fecha.lt).toBeInstanceOf(Date);
    expect(where.fecha.lt.getTime()).toBeLessThan(Date.now());
  });

  it('con el plan vencido no borra nada (agenda en solo-lectura)', async () => {
    const { res } = makeRes();

    await contableController.listVencimientos(
      makeReq({ planExpiresAt: new Date('2020-01-01') }), res, makeNext(),
    );

    expect(mockPrisma.vencimiento.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.vencimiento.findMany).toHaveBeenCalled(); // pero sí deja consultar
  });

  it('sin fecha de vencimiento del plan tampoco purga', async () => {
    const { res } = makeRes();

    await contableController.listVencimientos(makeReq({ planExpiresAt: null }), res, makeNext());

    expect(mockPrisma.vencimiento.deleteMany).not.toHaveBeenCalled();
  });

  it('ordena por fecha ascendente y limita el listado', async () => {
    const { res } = makeRes();

    await contableController.listVencimientos(makeReq(), res, makeNext());

    const args = mockPrisma.vencimiento.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ fecha: 'asc' }); // lo más próximo, arriba
    expect(args.take).toBe(2000);
    expect(args.where.taxClient).toEqual({ businessId: 'ofi-1' });
  });

  it('filtra por obligación y busca por cliente sin salirse de la oficina', async () => {
    const { res } = makeRes();

    await contableController.listVencimientos(
      makeReq({ query: { obligacion: 'iva', search: 'trigo' } }), res, makeNext(),
    );

    const where = mockPrisma.vencimiento.findMany.mock.calls[0][0].where;
    expect(where.obligacion).toBe('iva');
    expect(where.taxClient.businessId).toBe('ofi-1'); // el filtro de oficina no se pierde al buscar
    expect(where.taxClient.OR).toContainEqual({ razonSocial: { contains: 'trigo', mode: 'insensitive' } });
  });
});

// ─── createVencimiento ───────────────────────────────────────────────────────

describe('contableController.createVencimiento', () => {
  it('404 si el cliente es de otra oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createVencimiento(makeReq({ body: bodyVenc({ taxClientId: 'tc-ajeno' }) }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.vencimiento.create).not.toHaveBeenCalled();
  });

  it.each([
    ['sin obligación', bodyVenc({ obligacion: undefined })],
    ['con una obligación inventada', bodyVenc({ obligacion: 'criptomonedas' })],
    ['sin periodo', bodyVenc({ periodo: '  ' })],
    ['sin fecha', bodyVenc({ fecha: undefined })],
  ])('rechaza el vencimiento %s', async (_caso, cuerpo) => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createVencimiento(makeReq({ body: cuerpo }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.vencimiento.create).not.toHaveBeenCalled();
  });

  it.each([
    ['con formato raro', '15/04/2026'],
    ['con mes imposible', '2026-13-01'],
    ['con un día que no existe', '2026-02-30'],
    ['a medias', '2026-04'],
  ])('rechaza la fecha %s con 400 (no revienta en 500)', async (_caso, fecha) => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createVencimiento(makeReq({ body: bodyVenc({ fecha }) }), res, next);

    const err = errorDe(next);
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('fecha');
    expect(mockPrisma.vencimiento.create).not.toHaveBeenCalled();
  });

  it.each([
    ['un texto', 'mucha plata'],
    ['un negativo', -5000],
  ])('rechaza el monto que es %s', async (_caso, monto) => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createVencimiento(makeReq({ body: bodyVenc({ monto }) }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.vencimiento.create).not.toHaveBeenCalled();
  });

  it('guarda el vencimiento con la fecha en UTC y el monto como decimal', async () => {
    mockPrisma.vencimiento.create.mockResolvedValue({ id: 'v1' });
    const { res, status } = makeRes();

    await contableController.createVencimiento(makeReq({
      body: bodyVenc({ monto: '1500000.50', notas: '  pagar con saldo a favor  ' }),
    }), res, makeNext());

    const data = mockPrisma.vencimiento.create.mock.calls[0][0].data;
    expect(data.fecha.toISOString()).toBe('2026-04-15T00:00:00.000Z');
    expect(data.monto?.toString()).toBe('1500000.5');
    expect(data.notas).toBe('pagar con saldo a favor'); // recortado
    expect(status).toHaveBeenCalledWith(201);
  });

  it('guarda a qué año de calendario pertenece', async () => {
    mockPrisma.vencimiento.create.mockResolvedValue({ id: 'v1' });
    const { res } = makeRes();

    await contableController.createVencimiento(makeReq({ body: bodyVenc() }), res, makeNext());

    // Sin el año, el "Marzo" que escriba a mano este año chocaría con el del
    // año siguiente y el segundo no se podría crear.
    expect(mockPrisma.vencimiento.create.mock.calls[0][0].data.anio).toBe(ANIO_ESPERADO);
  });

  it('acepta que no venga monto', async () => {
    mockPrisma.vencimiento.create.mockResolvedValue({ id: 'v1' });
    const { res } = makeRes();

    await contableController.createVencimiento(makeReq({ body: bodyVenc({ monto: '' }) }), res, makeNext());

    expect(mockPrisma.vencimiento.create.mock.calls[0][0].data.monto).toBeNull();
  });

  it('409 si ese cliente ya tiene esa obligación en ese periodo', async () => {
    mockPrisma.vencimiento.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5' }),
    );
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createVencimiento(makeReq({ body: bodyVenc() }), res, next);

    expect(errorDe(next).statusCode).toBe(409);
  });
});

// ─── generarVencimientos ─────────────────────────────────────────────────────

describe('contableController.generarVencimientos', () => {
  it('exige el cliente', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.generarVencimientos(makeReq({ body: {} }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('404 si el cliente no es de la oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.generarVencimientos(makeReq({ body: { taxClientId: 'tc-ajeno' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
  });

  it('marca cada vencimiento generado con el año del calendario', async () => {
    mockPrisma.calendarioDian.findMany.mockResolvedValue([
      { periodo: 'Enero', fecha: new Date('2026-02-10') },
    ]);
    mockPrisma.vencimiento.create.mockResolvedValue({ id: 'v1' });
    const { res } = makeRes();

    await contableController.generarVencimientos(makeReq({
      body: { taxClientId: 'tc-1', obligacion: 'retefuente' },
    }), res, makeNext());

    // Esto es lo que hará que en enero, al sembrar el calendario nuevo, el
    // "Enero" del año siguiente NO choque con este y se genere de verdad.
    // Sin el año, skipDuplicates lo saltaría sin dar error y el cliente se
    // quedaría sin ese vencimiento.
    expect(mockPrisma.vencimiento.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ periodo: 'Enero', anio: ANIO_ESPERADO }),
    );
  });

  it('genera la agenda que corresponde a las calidades del cliente', async () => {
    mockPrisma.calendarioDian.findMany.mockResolvedValue([
      { periodo: 'Año 2025', fecha: new Date('2026-04-15') },
    ]);
    mockPrisma.vencimiento.create.mockResolvedValue({ id: 'v1' });
    const { res, json } = makeRes();

    await contableController.generarVencimientos(makeReq({ body: { taxClientId: 'tc-1' } }), res, makeNext());

    // Declarante de renta → se le genera renta.
    expect(mockPrisma.vencimiento.create).toHaveBeenCalledWith({
      data: { taxClientId: 'tc-1', obligacion: 'renta', periodo: 'Año 2025', fecha: expect.any(Date), anio: ANIO_ESPERADO },
    });
    expect(json.mock.calls[0][0].data.creados).toBe(1);
  });

  it('registra solo los periodos que el contador eligió', async () => {
    mockPrisma.calendarioDian.findMany.mockResolvedValue([
      { periodo: 'Bimestre 1', fecha: new Date('2026-03-10') },
      { periodo: 'Bimestre 2', fecha: new Date('2026-05-12') },
      { periodo: 'Bimestre 3', fecha: new Date('2026-07-14') },
    ]);
    mockPrisma.vencimiento.create.mockResolvedValue({ id: 'v1' });
    const { res, json } = makeRes();

    await contableController.generarVencimientos(makeReq({
      body: { taxClientId: 'tc-1', obligacion: 'iva', periodos: ['Bimestre 2', 'Bimestre 3'] },
    }), res, makeNext());

    expect(mockPrisma.vencimiento.create).toHaveBeenCalledTimes(2);
    const periodos = mockPrisma.vencimiento.create.mock.calls.map((c: any) => c[0].data.periodo);
    expect(periodos).toEqual(['Bimestre 2', 'Bimestre 3']);
    expect(json.mock.calls[0][0].data.creados).toBe(2);
  });

  it('es idempotente: los que ya existían se cuentan aparte, no fallan', async () => {
    mockPrisma.calendarioDian.findMany.mockResolvedValue([
      { periodo: 'Año 2025', fecha: new Date('2026-04-15') },
    ]);
    mockPrisma.vencimiento.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5' }),
    );
    const { res, json } = makeRes();
    const next = makeNext();

    await contableController.generarVencimientos(makeReq({ body: { taxClientId: 'tc-1' } }), res, next);

    expect(next).not.toHaveBeenCalled();
    const respuesta = json.mock.calls[0][0];
    expect(respuesta.data).toEqual(expect.objectContaining({ creados: 0, existentes: 1 }));
    expect(respuesta.message).toContain('ya estaban registrados');
  });

  it('reporta aparte las obligaciones que no tienen calendario', async () => {
    mockPrisma.calendarioDian.findMany.mockResolvedValue([]); // ICA no está en el calendario DIAN
    const { res, json } = makeRes();

    await contableController.generarVencimientos(makeReq({
      body: { taxClientId: 'tc-1', obligacion: 'ica' },
    }), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.sinCalendario).toEqual(['ica']);
    expect(data.creados).toBe(0);
    expect(mockPrisma.vencimiento.create).not.toHaveBeenCalled();
  });
});

// ─── updateEstadoVencimiento ─────────────────────────────────────────────────

describe('contableController.updateEstadoVencimiento', () => {
  it.each(['pendiente', 'en_proceso', 'presentada', 'pagada', 'no_aplica'])('acepta el estado %s', async (estado) => {
    mockPrisma.vencimiento.findFirst.mockResolvedValue({ id: 'v1' });
    mockPrisma.vencimiento.update.mockResolvedValue({ id: 'v1', estado });
    const { res } = makeRes();

    await contableController.updateEstadoVencimiento(makeReq({ params: { id: 'v1' }, body: { estado } }), res, makeNext());

    expect(mockPrisma.vencimiento.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { estado } });
  });

  it('deja marcar "no aplica" cuando ese periodo no había nada que declarar', async () => {
    // El caso del contador: retefuente en un mes sin retenciones practicadas.
    // Se decide periodo por periodo, así que es un estado más del vencimiento.
    mockPrisma.vencimiento.findFirst.mockResolvedValue({ id: 'v1' });
    mockPrisma.vencimiento.update.mockResolvedValue({ id: 'v1', estado: 'no_aplica' });
    const { res, json } = makeRes();
    const next = makeNext();

    await contableController.updateEstadoVencimiento(
      makeReq({ params: { id: 'v1' }, body: { estado: 'no_aplica' } }), res, next,
    );

    expect(next).not.toHaveBeenCalled();
    expect(mockPrisma.vencimiento.update).toHaveBeenCalledWith({
      where: { id: 'v1' }, data: { estado: 'no_aplica' },
    });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('no deja marcar "vencida" a mano (esa la pone la fecha)', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateEstadoVencimiento(makeReq({ params: { id: 'v1' }, body: { estado: 'vencida' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.vencimiento.update).not.toHaveBeenCalled();
  });

  it('404 si el vencimiento es de otra oficina', async () => {
    mockPrisma.vencimiento.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateEstadoVencimiento(
      makeReq({ params: { id: 'v-ajeno' }, body: { estado: 'pagada' } }), res, next,
    );

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.vencimiento.findFirst).toHaveBeenCalledWith({
      where: { id: 'v-ajeno', taxClient: { businessId: 'ofi-1' } },
    });
    expect(mockPrisma.vencimiento.update).not.toHaveBeenCalled();
  });
});

// ─── deleteVencimiento ───────────────────────────────────────────────────────

describe('contableController.deleteVencimiento', () => {
  it('borra el vencimiento propio', async () => {
    mockPrisma.vencimiento.findFirst.mockResolvedValue({ id: 'v1' });
    const { res, json } = makeRes();

    await contableController.deleteVencimiento(makeReq({ params: { id: 'v1' } }), res, makeNext());

    expect(mockPrisma.vencimiento.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('no borra el de otra oficina', async () => {
    mockPrisma.vencimiento.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.deleteVencimiento(makeReq({ params: { id: 'v-ajeno' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.vencimiento.delete).not.toHaveBeenCalled();
  });
});

// ─── periodos (consulta del calendario) ──────────────────────────────────────

describe('contableController.periodos', () => {
  it('exige la obligación', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.periodos(makeReq({ query: { taxClientId: 'tc-1' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('404 si consultan el calendario de un cliente ajeno', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.periodos(makeReq({ query: { obligacion: 'renta', taxClientId: 'tc-ajeno' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
  });

  it('para renta de persona natural usa la tabla por los dos últimos dígitos', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue({ ...cliente, tipoPersona: 'natural', nit: '1020304050' });
    mockPrisma.calendarioRentaNatural.findUnique.mockResolvedValue({ fecha: new Date('2026-08-20') });
    const { res, json } = makeRes();

    await contableController.periodos(makeReq({ query: { obligacion: 'renta', taxClientId: 'tc-1' } }), res, makeNext());

    expect(mockPrisma.calendarioRentaNatural.findUnique).toHaveBeenCalledWith({
      where: { anio_dosDigitos: { anio: expect.any(Number), dosDigitos: 50 } },
    });
    expect(json.mock.calls[0][0].data).toEqual([{ periodo: 'Año 2025', fecha: expect.any(Date) }]);
  });

  it('para IVA usa la periodicidad del cliente y el último dígito del NIT', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue({ ...cliente, ivaPeriodicidad: 'cuatrimestral', nit: '900123456' });
    const { res } = makeRes();

    await contableController.periodos(makeReq({ query: { obligacion: 'iva', taxClientId: 'tc-1' } }), res, makeNext());

    expect(mockPrisma.calendarioDian.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ obligacion: 'iva', variante: 'cuatrimestral', digito: 6 }),
      }),
    );
  });

  it('devuelve lista vacía cuando la obligación no tiene calendario', async () => {
    const { res, json } = makeRes();

    await contableController.periodos(makeReq({ query: { obligacion: 'ica', taxClientId: 'tc-1' } }), res, makeNext());

    expect(json.mock.calls[0][0].data).toEqual([]);
  });
});
