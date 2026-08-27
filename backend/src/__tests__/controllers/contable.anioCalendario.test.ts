/**
 * El cambio de año del calendario tributario.
 *
 * Cada enero la DIAN publica un decreto nuevo, se siembra ese calendario y se
 * apunta ANIO_CALENDARIO al año nuevo. El riesgo que cubre esta prueba: los
 * periodos mensuales se llaman "Enero", "Febrero"… sin año, así que si la llave
 * única no incluyera el año, el "Enero" del calendario nuevo chocaría con el del
 * anterior. Y como la agenda se genera con skipDuplicates, no daría error: se
 * saltaría EN SILENCIO y el cliente se quedaría sin ese vencimiento hasta que se
 * le pasara la fecha.
 *
 * Aquí se recarga el controlador con otro ANIO_CALENDARIO —igual que pasará en
 * producción al cambiar la variable— y se comprueba que lo generado queda
 * marcado con el año nuevo.
 */

const prismaMock: any = {
  taxClient: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  vencimiento: { create: jest.fn(), createMany: jest.fn().mockResolvedValue({ count: 0 }), findMany: jest.fn().mockResolvedValue([]) },
  calendarioDian: { findMany: jest.fn().mockResolvedValue([]) },
  calendarioRentaNatural: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  $transaction: jest.fn((cb: any) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
};

jest.mock('../../config/database', () => ({ prisma: prismaMock }));
jest.mock('../../utils/pagination', () => ({
  getPagination: jest.fn().mockReturnValue({ page: 1, limit: 20, skip: 0 }),
  getSearch: jest.fn().mockReturnValue(undefined),
}));
jest.mock('../../config/cloudinary', () => ({ uploadDocument: jest.fn(), deleteImage: jest.fn() }));

const cliente = {
  id: 'tc-1', businessId: 'ofi-1', razonSocial: 'Panadería El Trigo SAS',
  nit: '900123456', tipoPersona: 'juridica', ivaPeriodicidad: null,
  responsabilidades: ['agente_retenedor'],
};

function makeReq(body: Record<string, unknown>) {
  return {
    user: { userId: 'u-1', role: 'ADMIN', businessId: 'ofi-1', branchId: 'br-1' },
    planExpiresAt: new Date(Date.now() + 30 * 86_400_000),
    params: {}, query: {}, body,
  } as never;
}
const makeRes = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() } as never);
const next = () => jest.fn() as never;

/** Carga el controlador como si el servidor arrancara con ese ANIO_CALENDARIO. */
function controladorDelAnio(anio: string) {
  jest.resetModules();
  process.env.ANIO_CALENDARIO = anio;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../controllers/contable.controller').contableController;
}

const anioOriginal = process.env.ANIO_CALENDARIO;
afterAll(() => {
  if (anioOriginal === undefined) delete process.env.ANIO_CALENDARIO;
  else process.env.ANIO_CALENDARIO = anioOriginal;
});

beforeEach(() => {
  jest.clearAllMocks();
  prismaMock.taxClient.findFirst.mockResolvedValue(cliente);
  prismaMock.vencimiento.create.mockResolvedValue({ id: 'v1' });
  prismaMock.calendarioDian.findMany.mockResolvedValue([
    { periodo: 'Enero', fecha: new Date('2026-02-10') },
  ]);
});

describe('cambio de año del calendario', () => {
  it('lo generado queda marcado con el año en curso', async () => {
    const ctrl = controladorDelAnio('2026');

    await ctrl.generarVencimientos(makeReq({ taxClientId: 'tc-1', obligacion: 'retefuente' }), makeRes(), next());

    expect(prismaMock.vencimiento.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ periodo: 'Enero', anio: 2026 }),
    );
  });

  it('al apuntar al año siguiente, el MISMO periodo se marca con el año nuevo', async () => {
    // Este es el momento de enero: mismo cliente, misma obligación, mismo
    // "Enero" — pero es otro vencimiento, el del calendario nuevo.
    const ctrl = controladorDelAnio('2027');

    await ctrl.generarVencimientos(makeReq({ taxClientId: 'tc-1', obligacion: 'retefuente' }), makeRes(), next());

    expect(prismaMock.vencimiento.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({ periodo: 'Enero', anio: 2027 }),
    );
  });

  it('el calendario que consulta también es el del año apuntado', async () => {
    const ctrl = controladorDelAnio('2027');

    await ctrl.generarVencimientos(makeReq({ taxClientId: 'tc-1', obligacion: 'retefuente' }), makeRes(), next());

    // Si siguiera leyendo el calendario viejo, repetiría las fechas del año
    // pasado: hay que sembrar el nuevo Y apuntar la variable.
    expect(prismaMock.calendarioDian.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ anio: 2027 }) }),
    );
  });

  it('la regeneración en lote también marca el año nuevo', async () => {
    const ctrl = controladorDelAnio('2027');
    prismaMock.taxClient.findMany.mockResolvedValue([
      { id: 'tc-1', nit: '900123456', tipoPersona: 'juridica', ivaPeriodicidad: null, responsabilidades: ['agente_retenedor'] },
    ]);
    prismaMock.calendarioDian.findMany.mockResolvedValue([
      { obligacion: 'retefuente', variante: null, digito: 6, periodo: 'Enero', fecha: new Date('2027-02-10') },
    ]);
    prismaMock.vencimiento.createMany.mockResolvedValue({ count: 1 });

    await ctrl.regenerarAgendaTodos(makeReq({}), makeRes(), next());

    const filas = prismaMock.vencimiento.createMany.mock.calls[0][0].data;
    expect(filas[0]).toEqual(expect.objectContaining({ periodo: 'Enero', anio: 2027 }));
    // skipDuplicates sigue puesto (no debe duplicar lo ya generado del mismo año),
    // y por eso justamente el año tiene que ir en la fila.
    expect(prismaMock.vencimiento.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });
});
