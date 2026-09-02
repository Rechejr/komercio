import request from 'supertest';
import ExcelJS from 'exceljs';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

// Importación masiva de cuentas por pagar. Los archivos de prueba se arman DE
// VERDAD con ExcelJS: así se prueba el camino real —detectar los encabezados,
// leer montos en formato colombiano y aguantar filas sucias—, que es donde un
// import falla de verdad.

jest.mock('../../config/database', () => ({
  prisma: {
    supplier: { findMany: jest.fn(), create: jest.fn() },
    supplierCredit: { create: jest.fn() },
    business: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
  },
}));

jest.mock('../../config/redis', () => ({
  cache: { get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(1) },
  makeRateLimitStore: () => undefined,
  redis: null,
}));

const mockPrisma = prisma as unknown as {
  supplier: { findMany: jest.Mock; create: jest.Mock };
  supplierCredit: { create: jest.Mock };
  business: { findUnique: jest.Mock };
};

const token = jwtUtils.generateAccessToken({
  userId: 'u-1', email: 'due@no.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'br-1',
});

/** Arma un .xlsx en memoria, como el que sube el negocio. */
async function excel(filas: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Cuentas');
  filas.forEach((f) => ws.addRow(f));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const ENCABEZADOS = ['Proveedor', 'Factura', 'Valor total', 'Abonado', 'Vence', 'Notas'];

const subir = (buf: Buffer, query = '') =>
  request(app)
    .post(`/api/v1/supplier-credits/import${query}`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buf, 'cuentas.xlsx');

beforeEach(() => {
  jest.clearAllMocks();
  // Plan Pro: la importación masiva es función de pago.
  mockPrisma.business.findUnique.mockResolvedValue({ plan: 'pro', planExpiresAt: null });
  mockPrisma.supplier.findMany.mockResolvedValue([]);
  mockPrisma.supplier.create.mockImplementation(({ data }: any) =>
    Promise.resolve({ id: `sup-${data.name}` }));
  mockPrisma.supplierCredit.create.mockResolvedValue({ id: 'sc-1' });
});

describe('plantilla de cuentas por pagar', () => {
  it('se descarga sin necesidad de sesión (va en blanco)', async () => {
    const res = await request(app)
      .get('/api/v1/supplier-credits/import-template')
      .buffer(true)
      .parse((r, cb) => {
        const trozos: Buffer[] = [];
        r.on('data', (t: Buffer) => trozos.push(t));
        r.on('end', () => cb(null, Buffer.concat(trozos)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('plantilla-cuentas-por-pagar.xlsx');
    expect((res.body as Buffer).length).toBeGreaterThan(1000);
  });

  it('trae las columnas que el import espera', async () => {
    const res = await request(app)
      .get('/api/v1/supplier-credits/import-template')
      .buffer(true)
      .parse((r, cb) => {
        const trozos: Buffer[] = [];
        r.on('data', (t: Buffer) => trozos.push(t));
        r.on('end', () => cb(null, Buffer.concat(trozos)));
      });

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body);
    const fila = wb.worksheets[0].getRow(1);
    const headers: string[] = [];
    fila.eachCell((c) => headers.push(String(c.value)));
    expect(headers).toEqual(['Proveedor', 'Factura', 'Valor total', 'Abonado', 'Vence', 'Notas']);
  });
});

describe('importar cuentas por pagar', () => {
  it('exige la columna del proveedor', async () => {
    const buf = await excel([['Valor total'], [500000]]);
    const res = await subir(buf);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('proveedor');
  });

  it('exige la columna del valor', async () => {
    const buf = await excel([['Proveedor'], ['Maderas del Norte']]);
    const res = await subir(buf);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('valor');
  });

  it('la vista previa no escribe nada', async () => {
    const buf = await excel([ENCABEZADOS, ['Maderas del Norte', 'FV-1', 500000, 0, '2026-10-15', '']]);
    const res = await subir(buf, '?dryRun=true');

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(1);
    expect(mockPrisma.supplierCredit.create).not.toHaveBeenCalled();
    expect(mockPrisma.supplier.create).not.toHaveBeenCalled();
  });

  it('crea la cuenta y calcula el saldo', async () => {
    const buf = await excel([ENCABEZADOS, ['Maderas del Norte', 'FV-877', 800000, 300000, '2026-09-30', '']]);
    const res = await subir(buf);

    expect(res.status).toBe(200);
    const data = mockPrisma.supplierCredit.create.mock.calls[0][0].data;
    expect(data.totalAmount).toBe(800000);
    expect(data.paidAmount).toBe(300000);
    expect(data.balance).toBe(500000);
    expect(data.status).toBe('PARTIAL'); // ya tiene un abono
    expect(data.businessId).toBe('biz-1');
  });

  it('lee montos escritos con puntos de miles', async () => {
    // Es como los escribe la gente aquí: "1.500.000".
    const buf = await excel([ENCABEZADOS, ['Distribuidora El Sol', '', '1.500.000', '', '', '']]);
    await subir(buf);

    expect(mockPrisma.supplierCredit.create.mock.calls[0][0].data.totalAmount).toBe(1_500_000);
  });

  it.each([
    ['2026-10-15', '2026-10-15'],
    ['15/10/2026', '2026-10-15'],
  ])('entiende la fecha %s', async (escrita, esperada) => {
    const buf = await excel([ENCABEZADOS, ['Maderas', '', 500000, 0, escrita, '']]);
    await subir(buf);

    const fecha = mockPrisma.supplierCredit.create.mock.calls[0][0].data.dueDate as Date;
    expect(fecha.toISOString().slice(0, 10)).toBe(esperada);
  });

  it('una fecha que no se entiende no bota la fila: queda sin plazo', async () => {
    const buf = await excel([ENCABEZADOS, ['Maderas', '', 500000, 0, 'el otro mes', '']]);
    const res = await subir(buf);

    expect(mockPrisma.supplierCredit.create.mock.calls[0][0].data.dueDate).toBeNull();
    expect(res.body.data.imported).toBe(1);
  });

  it('crea el proveedor si no existe', async () => {
    const buf = await excel([ENCABEZADOS, ['Proveedor Nuevo', '', 500000, 0, '', '']]);
    const res = await subir(buf);

    expect(mockPrisma.supplier.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { businessId: 'biz-1', name: 'Proveedor Nuevo' } }),
    );
    expect(res.body.data.proveedoresCreados).toBe(1);
  });

  it('reutiliza el proveedor que ya existe, sin importar mayúsculas', async () => {
    mockPrisma.supplier.findMany.mockResolvedValue([{ id: 'sup-9', name: 'Maderas del Norte' }]);
    const buf = await excel([ENCABEZADOS, ['MADERAS DEL NORTE', '', 500000, 0, '', '']]);
    await subir(buf);

    expect(mockPrisma.supplier.create).not.toHaveBeenCalled();
    expect(mockPrisma.supplierCredit.create.mock.calls[0][0].data.supplierId).toBe('sup-9');
  });

  it('el mismo proveedor repetido se crea una sola vez', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Textiles Andinos', 'FV-1', 100000, 0, '', ''],
      ['Textiles Andinos', 'FV-2', 200000, 0, '', ''],
    ]);
    const res = await subir(buf);

    expect(mockPrisma.supplier.create).toHaveBeenCalledTimes(1);
    expect(res.body.data.imported).toBe(2);
  });

  it('marca como error la fila sin valor', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Sin Valor', '', '', 0, '', ''],
      ['Con Valor', '', 300000, 0, '', ''],
    ]);
    const res = await subir(buf, '?dryRun=true');

    expect(res.body.data.valid).toBe(1);
    expect(res.body.data.issues).toContainEqual(
      expect.objectContaining({ type: 'error', name: 'Sin Valor' }),
    );
  });

  it('avisa si lo abonado supera el total y la importa sin abono', async () => {
    const buf = await excel([ENCABEZADOS, ['Maderas', '', 100000, 500000, '', '']]);
    const res = await subir(buf);

    expect(mockPrisma.supplierCredit.create.mock.calls[0][0].data.paidAmount).toBe(0);
    expect(res.body.data.imported).toBe(1);
  });

  it('guarda el número de factura en las notas', async () => {
    const buf = await excel([ENCABEZADOS, ['Maderas', 'FV-1024', 500000, 0, '', 'Mercancía de octubre']]);
    await subir(buf);

    expect(mockPrisma.supplierCredit.create.mock.calls[0][0].data.notes)
      .toBe('Factura FV-1024 — Mercancía de octubre');
  });

  it('salta las filas sin proveedor en vez de contarlas', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Maderas', '', 500000, 0, '', ''],
      ['', '', '', '', '', ''],
      ['', 'FV-9', 300000, 0, '', ''],
    ]);
    const res = await subir(buf, '?dryRun=true');

    expect(res.body.data.total).toBe(1);
  });

  it('una fila que falla no tumba el resto del archivo', async () => {
    mockPrisma.supplierCredit.create
      .mockRejectedValueOnce(new Error('se cayó la conexión'))
      .mockResolvedValueOnce({ id: 'sc-2' });
    const buf = await excel([
      ENCABEZADOS,
      ['Maderas', '', 500000, 0, '', ''],
      ['Textiles', '', 300000, 0, '', ''],
    ]);
    const res = await subir(buf);

    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.errors).toHaveLength(1);
    expect(res.body.data.errors[0].message).toContain('Maderas');
  });

  it('sin plan Pro no deja importar', async () => {
    mockPrisma.business.findUnique.mockResolvedValue({ plan: 'free', planExpiresAt: null });
    const buf = await excel([ENCABEZADOS, ['Maderas', '', 500000, 0, '', '']]);

    const res = await subir(buf);

    expect(res.status).toBe(403);
    expect(mockPrisma.supplierCredit.create).not.toHaveBeenCalled();
  });
});
