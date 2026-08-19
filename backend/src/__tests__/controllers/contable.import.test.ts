import { Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { contableController } from '../../controllers/contable.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

// Importación masiva de clientes desde Excel. Es por donde entra la cartera
// completa de una oficina, así que los archivos de prueba se arman DE VERDAD con
// ExcelJS (no se mockea el parser): así se prueba el camino real —detectar los
// encabezados, interpretar las calidades escritas a mano y no reventar con
// filas sucias—, que es justo donde un import falla.

jest.mock('../../config/database', () => {
  const prismaMock: any = {
    taxClient: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), create: jest.fn(), update: jest.fn() },
    vencimiento: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
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

/** Arma un .xlsx en memoria, tal como llegaría desde el navegador. */
async function excel(filas: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Clientes');
  filas.forEach((f) => ws.addRow(f));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function makeReq(buffer: Buffer | null, query: Record<string, string> = {}): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'conta@x.com', role: 'ADMIN', businessId: 'ofi-1', branchId: 'br-1' },
    file: buffer ? { buffer } : undefined,
    params: {},
    query,
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

const ENCABEZADOS = ['Razón social', 'NIT', 'Tipo de persona', 'Celular', 'Dirección', 'Calidades', 'Periodicidad IVA'];

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.taxClient.findMany.mockResolvedValue([]);
  mockPrisma.taxClient.findFirst.mockResolvedValue(null);
  mockPrisma.taxClient.create.mockImplementation(({ data }: any) => Promise.resolve({ id: `tc-${data.nit}`, ...data }));
  mockPrisma.calendarioDian.findMany.mockResolvedValue([]);
});

// ─── Validación del archivo ──────────────────────────────────────────────────

describe('contableController.importClients — archivo', () => {
  it('exige el archivo', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await contableController.importClients(makeReq(null), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('avisa claro cuando falta la columna del nombre', async () => {
    const buf = await excel([['NIT', 'Celular'], ['900123456', '3001234567']]);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.importClients(makeReq(buf), res, next);

    const err = errorDe(next);
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('Nombre');
  });

  it('avisa claro cuando falta la columna del NIT', async () => {
    const buf = await excel([['Razón social', 'Celular'], ['Panadería El Trigo', '3001234567']]);
    const { res } = makeRes();
    const next = makeNext();

    await contableController.importClients(makeReq(buf), res, next);

    const err = errorDe(next);
    expect(err.statusCode).toBe(400);
    expect(err.message).toContain('NIT');
  });

  it('encuentra los encabezados aunque el Excel traiga título y filas en blanco arriba', async () => {
    const buf = await excel([
      ['LISTADO DE CLIENTES 2026'],
      [],
      ENCABEZADOS,
      ['Panadería El Trigo SAS', '900123456', 'Jurídica', '3001234567', 'Cra 1', 'Declarante de renta', ''],
    ]);
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf, { dryRun: 'true' }), res, makeNext());

    expect(json.mock.calls[0][0].data.valid).toBe(1);
  });

  it('reconoce encabezados con sinónimos, sin tildes y en mayúsculas', async () => {
    const buf = await excel([
      ['NOMBRE', 'CEDULA', 'NATURALEZA', 'TELEFONO'],
      ['Juan Pérez', '1020304050', 'Natural', '3001234567'],
    ]);
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf, { dryRun: 'true' }), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.valid).toBe(1);
    expect(data.detectedColumns.map((d: any) => d.field)).toEqual(
      expect.arrayContaining(['razonSocial', 'nit', 'tipoPersona', 'celular']),
    );
  });
});

// ─── Vista previa (dryRun) ───────────────────────────────────────────────────

describe('contableController.importClients — vista previa', () => {
  it('no escribe nada en la base de datos', async () => {
    const buf = await excel([ENCABEZADOS, ['Panadería El Trigo SAS', '900123456', 'Jurídica', '', '', '', '']]);
    const { res } = makeRes();

    await contableController.importClients(makeReq(buf, { dryRun: 'true' }), res, makeNext());

    expect(mockPrisma.taxClient.create).not.toHaveBeenCalled();
    expect(mockPrisma.taxClient.update).not.toHaveBeenCalled();
  });

  it('separa los que se crearían de los que se actualizarían', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Panadería El Trigo SAS', '900123456', 'Jurídica', '', '', '', ''],
      ['Ferretería La Tuerca', '901000000', 'Jurídica', '', '', '', ''],
    ]);
    // El primero ya existe en la oficina.
    mockPrisma.taxClient.findMany.mockResolvedValue([{ nit: '900123456' }]);
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf, { dryRun: 'true' }), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.total).toBe(2);
    expect(data.toUpdate).toBe(1);
    expect(data.toCreate).toBe(1);
    // El cotejo de existentes va acotado a la oficina del token.
    expect(mockPrisma.taxClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ businessId: 'ofi-1' }) }),
    );
  });

  it('marca como error la fila sin NIT y no la cuenta como válida', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Cliente Sin Documento', '', 'Jurídica', '', '', '', ''],
      ['Panadería El Trigo SAS', '900123456', 'Jurídica', '', '', '', ''],
    ]);
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf, { dryRun: 'true' }), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.valid).toBe(1);
    expect(data.issues).toContainEqual(
      expect.objectContaining({ type: 'error', name: 'Cliente Sin Documento' }),
    );
  });

  it('avisa del NIT repetido dentro del archivo y se queda con la primera fila', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Panadería El Trigo SAS', '900123456', 'Jurídica', '', '', '', ''],
      ['Panaderia el trigo (repetida)', '900.123.456', 'Jurídica', '', '', '', ''],
    ]);
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf, { dryRun: 'true' }), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.valid).toBe(1);
    expect(data.issues).toContainEqual(
      expect.objectContaining({ type: 'warning', message: expect.stringContaining('repetido') }),
    );
  });

  it('sin columna de tipo de persona avisa una sola vez y asume Jurídica', async () => {
    const buf = await excel([
      ['Razón social', 'NIT'],
      ['Panadería El Trigo SAS', '900123456'],
      ['Ferretería La Tuerca', '901000000'],
    ]);
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf, { dryRun: 'true' }), res, makeNext());

    const avisos = json.mock.calls[0][0].data.issues.filter((i: any) =>
      i.message.includes('Tipo de persona'));
    expect(avisos).toHaveLength(1); // global, no una por fila
  });

  it('salta las filas sin nombre en vez de contarlas', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Panadería El Trigo SAS', '900123456', 'Jurídica', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '901000000', 'Jurídica', '', '', '', ''],
    ]);
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf, { dryRun: 'true' }), res, makeNext());

    expect(json.mock.calls[0][0].data.total).toBe(1);
  });
});

// ─── Importación real ────────────────────────────────────────────────────────

describe('contableController.importClients — importación real', () => {
  it('crea los nuevos y actualiza los que ya estaban, por NIT', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Panadería El Trigo SAS', '900123456', 'Jurídica', '3001234567', 'Cra 1 #2-3', 'Declarante de renta', ''],
      ['Ferretería La Tuerca', '901000000', 'Jurídica', '', '', '', ''],
    ]);
    // El primero ya existe; el segundo no.
    mockPrisma.taxClient.findFirst
      .mockResolvedValueOnce({ id: 'tc-existente' })
      .mockResolvedValueOnce(null);
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf), res, makeNext());

    expect(mockPrisma.taxClient.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'tc-existente' }, data: expect.objectContaining({ activo: true }) }),
    );
    expect(mockPrisma.taxClient.create).toHaveBeenCalledTimes(1);
    const data = json.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ imported: 1, updated: 1 }));
    // Cada búsqueda del existente queda encerrada en la oficina.
    expect(mockPrisma.taxClient.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'ofi-1', nit: '900123456' } }),
    );
  });

  it('separa el DV cuando el Excel trae el NIT como sale del RUT', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Panadería El Trigo SAS', '900123456-7', 'Jurídica', '', '', '', ''],
    ]);
    const { res } = makeRes();

    await contableController.importClients(makeReq(buf), res, makeNext());

    // El DV no puede quedar dentro del número: cambiaría el último dígito, que
    // es el que define las fechas del calendario DIAN de ese cliente.
    expect(mockPrisma.taxClient.create.mock.calls[0][0].data.nit).toBe('900123456');
  });

  it('avisa si el DV escrito no le corresponde al NIT, pero igual importa', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Panadería El Trigo SAS', '900123456-1', 'Jurídica', '', '', '', ''],
    ]);
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf, { dryRun: 'true' }), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.valid).toBe(1); // no se descarta la fila
    expect(data.issues).toContainEqual(
      expect.objectContaining({ type: 'warning', message: expect.stringContaining('RUT') }),
    );
  });

  it('interpreta las calidades escritas a mano y las guarda normalizadas', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Panadería El Trigo SAS', '900123456', 'Jurídica', '', '', 'Responsable de IVA; Declarante de renta', 'Bimestral'],
    ]);
    const { res } = makeRes();

    await contableController.importClients(makeReq(buf), res, makeNext());

    const data = mockPrisma.taxClient.create.mock.calls[0][0].data;
    expect(data.responsabilidades).toEqual(expect.arrayContaining(['responsable_iva', 'declarante_renta']));
    expect(data.ivaPeriodicidad).toBe('bimestral');
    expect(data.businessId).toBe('ofi-1');
  });

  it('no marca una calidad que viene negada ("No responsable de IVA")', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Tienda Doña Mary', '1020304050', 'Natural', '', '', 'No responsable de IVA', ''],
    ]);
    const { res } = makeRes();

    await contableController.importClients(makeReq(buf), res, makeNext());

    const data = mockPrisma.taxClient.create.mock.calls[0][0].data;
    expect(data.responsabilidades).not.toContain('responsable_iva');
    expect(data.ivaPeriodicidad).toBeNull();
  });

  it('ignora la periodicidad de IVA de quien no es responsable de IVA', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Tienda Doña Mary', '1020304050', 'Natural', '', '', 'Declarante de renta', 'Bimestral'],
    ]);
    const { res } = makeRes();

    await contableController.importClients(makeReq(buf), res, makeNext());

    expect(mockPrisma.taxClient.create.mock.calls[0][0].data.ivaPeriodicidad).toBeNull();
  });

  it('reconoce la persona natural escrita de varias formas', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Juan Pérez', '1020304050', 'PN', '', '', '', ''],
      ['María Gómez', '1020304051', 'persona natural declarante', '', '', '', ''],
    ]);
    const { res } = makeRes();

    await contableController.importClients(makeReq(buf), res, makeNext());

    const tipos = mockPrisma.taxClient.create.mock.calls.map((c: any) => c[0].data.tipoPersona);
    expect(tipos).toEqual(['natural', 'natural']);
  });

  it('una fila que falla no tumba el resto del archivo', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Panadería El Trigo SAS', '900123456', 'Jurídica', '', '', '', ''],
      ['Ferretería La Tuerca', '901000000', 'Jurídica', '', '', '', ''],
    ]);
    mockPrisma.taxClient.create
      .mockRejectedValueOnce(new Error('se cayó la conexión'))
      .mockResolvedValueOnce({ id: 'tc-2', nit: '901000000' });
    const { res, json } = makeRes();

    await contableController.importClients(makeReq(buf), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.imported).toBe(1); // el segundo sí entró
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].message).toContain('Panadería El Trigo SAS');
  });

  it('deja el import en pie aunque la generación de la agenda falle', async () => {
    const buf = await excel([ENCABEZADOS, ['Panadería El Trigo SAS', '900123456', 'Jurídica', '', '', 'Declarante de renta', '']]);
    mockPrisma.calendarioDian.findMany.mockRejectedValue(new Error('calendario no sembrado'));
    const { res, json } = makeRes();
    const next = makeNext();

    await contableController.importClients(makeReq(buf), res, next);

    expect(next).not.toHaveBeenCalled();
    const data = json.mock.calls[0][0].data;
    expect(data.imported).toBe(1);
    expect(data.generados).toBe(0);
  });
});
