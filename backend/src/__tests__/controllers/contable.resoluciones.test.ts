import { Response, NextFunction } from 'express';
import { contableController } from '../../controllers/contable.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

// Resoluciones DIAN (facturación) y responsabilidades manuales (exógena / otras),
// más las sugerencias de obligaciones y la regeneración anual de la agenda.
// Todo esto vive fuera del calendario automático, así que la validación de
// fechas/rangos y el encierro por oficina son lo que hay que sostener.

jest.mock('../../config/database', () => {
  const prismaMock: any = {
    taxClient: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    resolucionDian: {
      findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(),
      create: jest.fn(), delete: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    responsabilidadManual: {
      findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn(),
      create: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    vencimiento: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    calendarioDian: { findMany: jest.fn().mockResolvedValue([]) },
    calendarioRentaNatural: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
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
  responsabilidades: ['declarante_renta', 'responsable_iva'],
};

function bodyReso(extra: Record<string, unknown> = {}) {
  return {
    taxClientId: 'tc-1', tipo: 'factura_electronica', numero: '18764000000001',
    fechaExpedicion: '2026-01-15', fechaVigencia: '2028-01-15', ...extra,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.taxClient.findFirst.mockResolvedValue(cliente);
  mockPrisma.resolucionDian.findMany.mockResolvedValue([]);
  mockPrisma.responsabilidadManual.findMany.mockResolvedValue([]);
  mockPrisma.vencimiento.findMany.mockResolvedValue([]);
});

// ─── Resoluciones DIAN ───────────────────────────────────────────────────────

describe('contableController.listResoluciones', () => {
  it('purga las vencidas hace más de 2 meses con el plan al día', async () => {
    const { res } = makeRes();

    await contableController.listResoluciones(makeReq(), res, makeNext());

    const where = mockPrisma.resolucionDian.deleteMany.mock.calls[0][0].where;
    expect(where.taxClient).toEqual({ businessId: 'ofi-1' });
    expect(where.fechaVigencia.lt).toBeInstanceOf(Date);
  });

  it('con el plan vencido no purga nada', async () => {
    const { res } = makeRes();

    await contableController.listResoluciones(makeReq({ planExpiresAt: new Date('2020-01-01') }), res, makeNext());

    expect(mockPrisma.resolucionDian.deleteMany).not.toHaveBeenCalled();
  });

  it('404 si filtran por un cliente de otra oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.listResoluciones(makeReq({ query: { taxClientId: 'tc-ajeno' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.resolucionDian.findMany).not.toHaveBeenCalled();
  });

  it('ordena por vigencia, lo que primero se vence arriba', async () => {
    const { res } = makeRes();

    await contableController.listResoluciones(makeReq(), res, makeNext());

    const args = mockPrisma.resolucionDian.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ fechaVigencia: 'asc' });
    expect(args.where.taxClient).toEqual({ businessId: 'ofi-1' });
  });
});

describe('contableController.createResolucion', () => {
  it('404 si el cliente es de otra oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createResolucion(makeReq({ body: bodyReso({ taxClientId: 'tc-ajeno' }) }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.resolucionDian.create).not.toHaveBeenCalled();
  });

  it.each([
    ['con un tipo inventado', bodyReso({ tipo: 'resolucion_magica' })],
    ['sin número', bodyReso({ numero: '  ' })],
    ['sin fecha de expedición', bodyReso({ fechaExpedicion: undefined })],
    ['sin fecha de vigencia', bodyReso({ fechaVigencia: undefined })],
  ])('rechaza la resolución %s', async (_caso, body) => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createResolucion(makeReq({ body }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.resolucionDian.create).not.toHaveBeenCalled();
  });

  it('dice cuál de las dos fechas está mal', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createResolucion(makeReq({ body: bodyReso({ fechaVigencia: '2028-02-31' }) }), res, next);

    const err = errorDe(next);
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('vigencia');
  });

  it.each([
    ['un texto', 'mil'],
    ['un decimal', 10.5],
    ['un negativo', -5],
  ])('rechaza el rango que es %s', async (_caso, rangoDesde) => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createResolucion(makeReq({ body: bodyReso({ rangoDesde }) }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('guarda la resolución con fechas UTC y rangos como enteros', async () => {
    mockPrisma.resolucionDian.create.mockResolvedValue({ id: 'r-1' });
    const { res, status } = makeRes();

    await contableController.createResolucion(makeReq({
      body: bodyReso({ prefijo: '  FE  ', rangoDesde: '1', rangoHasta: '5000', modalidad: 'electronica', clase: 'autorizacion' }),
    }), res, makeNext());

    const data = mockPrisma.resolucionDian.create.mock.calls[0][0].data;
    expect(data.fechaExpedicion.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(data.rangoDesde).toBe(1);
    expect(data.rangoHasta).toBe(5000);
    expect(data.prefijo).toBe('FE');
    expect(data.modalidad).toBe('electronica');
    expect(data.clase).toBe('autorizacion');
    expect(status).toHaveBeenCalledWith(201);
  });

  it('descarta una modalidad o clase que no existe en vez de fallar', async () => {
    mockPrisma.resolucionDian.create.mockResolvedValue({ id: 'r-1' });
    const { res } = makeRes();

    await contableController.createResolucion(makeReq({
      body: bodyReso({ modalidad: 'inventada', clase: 'inventada' }),
    }), res, makeNext());

    const data = mockPrisma.resolucionDian.create.mock.calls[0][0].data;
    expect(data.modalidad).toBeNull();
    expect(data.clase).toBeNull();
  });
});

describe('contableController.deleteResolucion', () => {
  it('no borra la de otra oficina', async () => {
    mockPrisma.resolucionDian.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.deleteResolucion(makeReq({ params: { id: 'r-ajena' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.resolucionDian.delete).not.toHaveBeenCalled();
  });

  it('borra la propia', async () => {
    mockPrisma.resolucionDian.findFirst.mockResolvedValue({ id: 'r-1' });
    const { res, json } = makeRes();

    await contableController.deleteResolucion(makeReq({ params: { id: 'r-1' } }), res, makeNext());

    expect(mockPrisma.resolucionDian.delete).toHaveBeenCalledWith({ where: { id: 'r-1' } });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── Responsabilidades manuales (exógena / otras) ────────────────────────────

describe('contableController.listResponsabilidades', () => {
  it.each(['exogena', 'otra'])('acepta el tipo %s', async (tipo) => {
    const { res } = makeRes();

    await contableController.listResponsabilidades(makeReq({ query: { tipo } }), res, makeNext());

    expect(mockPrisma.responsabilidadManual.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tipo, taxClient: { businessId: 'ofi-1' } } }),
    );
  });

  it('rechaza un tipo que no existe', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.listResponsabilidades(makeReq({ query: { tipo: 'inventada' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.responsabilidadManual.findMany).not.toHaveBeenCalled();
  });

  it('solo purga lo ya presentado, nunca lo pendiente', async () => {
    const { res } = makeRes();

    await contableController.listResponsabilidades(makeReq({ query: { tipo: 'otra' } }), res, makeNext());

    const where = mockPrisma.responsabilidadManual.deleteMany.mock.calls[0][0].where;
    expect(where.estado).toBe('presentado');
    expect(where.taxClient).toEqual({ businessId: 'ofi-1' });
  });

  it('con el plan vencido no purga', async () => {
    const { res } = makeRes();

    await contableController.listResponsabilidades(
      makeReq({ query: { tipo: 'otra' }, planExpiresAt: null }), res, makeNext(),
    );

    expect(mockPrisma.responsabilidadManual.deleteMany).not.toHaveBeenCalled();
  });
});

describe('contableController.createResponsabilidad', () => {
  it('404 si el cliente es de otra oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createResponsabilidad(makeReq({
      body: { taxClientId: 'tc-ajeno', tipo: 'exogena', concepto: 'Formato 1001', fecha: '2026-05-20' },
    }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
  });

  it.each([
    ['con tipo inválido', { taxClientId: 'tc-1', tipo: 'iva', concepto: 'x', fecha: '2026-05-20' }],
    ['sin concepto', { taxClientId: 'tc-1', tipo: 'otra', concepto: '  ', fecha: '2026-05-20' }],
    ['sin fecha', { taxClientId: 'tc-1', tipo: 'otra', concepto: 'x' }],
    ['con fecha imposible', { taxClientId: 'tc-1', tipo: 'otra', concepto: 'x', fecha: '2026-02-30' }],
  ])('rechaza el registro %s', async (_caso, body) => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.createResponsabilidad(makeReq({ body }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.responsabilidadManual.create).not.toHaveBeenCalled();
  });

  it('nace pendiente si no le mandan estado', async () => {
    mockPrisma.responsabilidadManual.create.mockResolvedValue({ id: 'rm-1' });
    const { res } = makeRes();

    await contableController.createResponsabilidad(makeReq({
      body: { taxClientId: 'tc-1', tipo: 'exogena', concepto: '  Formato 1001  ', fecha: '2026-05-20' },
    }), res, makeNext());

    const data = mockPrisma.responsabilidadManual.create.mock.calls[0][0].data;
    expect(data.estado).toBe('pendiente');
    expect(data.concepto).toBe('Formato 1001');
    expect(data.fecha.toISOString()).toBe('2026-05-20T00:00:00.000Z');
  });

  it('un estado raro cae a pendiente, no rompe', async () => {
    mockPrisma.responsabilidadManual.create.mockResolvedValue({ id: 'rm-1' });
    const { res } = makeRes();

    await contableController.createResponsabilidad(makeReq({
      body: { taxClientId: 'tc-1', tipo: 'otra', concepto: 'x', fecha: '2026-05-20', estado: 'casi' },
    }), res, makeNext());

    expect(mockPrisma.responsabilidadManual.create.mock.calls[0][0].data.estado).toBe('pendiente');
  });
});

describe('contableController.updateResponsabilidad', () => {
  it('404 si el registro es de otra oficina', async () => {
    mockPrisma.responsabilidadManual.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateResponsabilidad(makeReq({ params: { id: 'rm-ajeno' }, body: { estado: 'presentado' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.responsabilidadManual.update).not.toHaveBeenCalled();
  });

  it('cambia solo lo que le mandan', async () => {
    mockPrisma.responsabilidadManual.findFirst.mockResolvedValue({ id: 'rm-1' });
    mockPrisma.responsabilidadManual.update.mockResolvedValue({ id: 'rm-1' });
    const { res } = makeRes();

    await contableController.updateResponsabilidad(makeReq({ params: { id: 'rm-1' }, body: { estado: 'presentado' } }), res, makeNext());

    const data = mockPrisma.responsabilidadManual.update.mock.calls[0][0].data;
    expect(data).toEqual({ estado: 'presentado' });
  });

  it('no acepta un estado inventado', async () => {
    mockPrisma.responsabilidadManual.findFirst.mockResolvedValue({ id: 'rm-1' });
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateResponsabilidad(makeReq({ params: { id: 'rm-1' }, body: { estado: 'medio_hecho' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('no deja vaciar el concepto', async () => {
    mockPrisma.responsabilidadManual.findFirst.mockResolvedValue({ id: 'rm-1' });
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateResponsabilidad(makeReq({ params: { id: 'rm-1' }, body: { concepto: '   ' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('valida también la fecha nueva', async () => {
    mockPrisma.responsabilidadManual.findFirst.mockResolvedValue({ id: 'rm-1' });
    const { res } = makeRes();
    const next = makeNext();

    await contableController.updateResponsabilidad(makeReq({ params: { id: 'rm-1' }, body: { fecha: '20-05-2026' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });
});

describe('contableController.deleteResponsabilidad', () => {
  it('no borra el de otra oficina', async () => {
    mockPrisma.responsabilidadManual.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.deleteResponsabilidad(makeReq({ params: { id: 'rm-ajeno' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
    expect(mockPrisma.responsabilidadManual.delete).not.toHaveBeenCalled();
  });

  it('borra el propio', async () => {
    mockPrisma.responsabilidadManual.findFirst.mockResolvedValue({ id: 'rm-1' });
    const { res, json } = makeRes();

    await contableController.deleteResponsabilidad(makeReq({ params: { id: 'rm-1' } }), res, makeNext());

    expect(mockPrisma.responsabilidadManual.delete).toHaveBeenCalledWith({ where: { id: 'rm-1' } });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── Sugerencias y regeneración anual ────────────────────────────────────────

describe('contableController.clientSuggestions', () => {
  it('sugiere solo las obligaciones que le faltan al cliente', async () => {
    // Es declarante de renta y responsable de IVA, pero ya tiene renta registrada.
    mockPrisma.vencimiento.findMany.mockResolvedValue([{ obligacion: 'renta' }]);
    const { res, json } = makeRes();

    await contableController.clientSuggestions(makeReq({ params: { id: 'tc-1' } }), res, makeNext());

    expect(json.mock.calls[0][0].data).toEqual(['iva']);
  });

  it('no sugiere nada si ya tiene todo', async () => {
    mockPrisma.vencimiento.findMany.mockResolvedValue([{ obligacion: 'renta' }, { obligacion: 'iva' }]);
    const { res, json } = makeRes();

    await contableController.clientSuggestions(makeReq({ params: { id: 'tc-1' } }), res, makeNext());

    expect(json.mock.calls[0][0].data).toEqual([]);
  });

  it('404 si el cliente es de otra oficina', async () => {
    mockPrisma.taxClient.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.clientSuggestions(makeReq({ params: { id: 'tc-ajeno' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
  });
});

describe('contableController.regenerarAgendaTodos', () => {
  it('solo toma los clientes activos de la oficina', async () => {
    mockPrisma.taxClient.findMany.mockResolvedValue([]);
    const { res, json } = makeRes();

    await contableController.regenerarAgendaTodos(makeReq(), res, makeNext());

    expect(mockPrisma.taxClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'ofi-1', activo: true } }),
    );
    expect(json.mock.calls[0][0].data.clientes).toBe(0);
  });

  it('genera en lote sin duplicar lo que ya existe', async () => {
    mockPrisma.taxClient.findMany.mockResolvedValue([
      { id: 'tc-1', nit: '900123456', tipoPersona: 'juridica', ivaPeriodicidad: null, responsabilidades: ['declarante_renta'] },
    ]);
    mockPrisma.calendarioDian.findMany.mockResolvedValue([
      { obligacion: 'renta', variante: 'juridica', digito: 6, periodo: 'Año 2025', fecha: new Date('2026-04-15') },
    ]);
    mockPrisma.vencimiento.createMany.mockResolvedValue({ count: 1 });
    const { res, json } = makeRes();

    await contableController.regenerarAgendaTodos(makeReq(), res, makeNext());

    expect(mockPrisma.vencimiento.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
    const data = json.mock.calls[0][0].data;
    expect(data.creados).toBe(1);
    expect(data.clientes).toBe(1);
    expect(data.anio).toEqual(expect.any(Number));
  });

  it('avisa cuando no había nada nuevo que generar', async () => {
    mockPrisma.taxClient.findMany.mockResolvedValue([
      { id: 'tc-1', nit: '900123456', tipoPersona: 'juridica', ivaPeriodicidad: null, responsabilidades: [] },
    ]);
    const { res, json } = makeRes();

    await contableController.regenerarAgendaTodos(makeReq(), res, makeNext());

    expect(json.mock.calls[0][0].message).toContain('ya estaban registrados');
  });
});
