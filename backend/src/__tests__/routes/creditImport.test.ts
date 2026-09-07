import request from 'supertest';
import ExcelJS from 'exceljs';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

// Importación masiva de fiados. Los archivos se arman DE VERDAD con ExcelJS: así
// se prueba el camino real —detectar encabezados, leer montos en formato
// colombiano, aguantar filas sucias—, que es donde un import falla de verdad.

jest.mock('../../config/database', () => ({
  prisma: {
    customer: { findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    credit: { create: jest.fn() },
    business: { findUnique: jest.fn() },
    user: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  cache: { get: jest.fn(), set: jest.fn(), del: jest.fn().mockResolvedValue(1) },
  makeRateLimitStore: () => undefined,
  redis: null,
}));

const mockPrisma = prisma as unknown as {
  customer: { findMany: jest.Mock; create: jest.Mock; update: jest.Mock };
  credit: { create: jest.Mock };
  business: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

const token = jwtUtils.generateAccessToken({
  userId: 'u-1', email: 'due@no.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'br-1',
});

async function excel(filas: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Fiados');
  filas.forEach((f) => ws.addRow(f));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const ENCABEZADOS = ['Cliente', 'Identificación', 'Teléfono', 'Factura', 'Valor total', 'Abonado', 'Vence', 'Notas'];

const subir = (buf: Buffer, query = '') =>
  request(app)
    .post(`/api/v1/credits/import${query}`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buf, 'fiados.xlsx');

beforeEach(() => {
  jest.clearAllMocks();
  // Plan Pro: la importación masiva es función de pago.
  mockPrisma.business.findUnique.mockResolvedValue({ plan: 'pro', planExpiresAt: null });
  mockPrisma.customer.findMany.mockResolvedValue([]);
  mockPrisma.customer.create.mockImplementation(({ data }: { data: { name: string } }) =>
    Promise.resolve({ id: `cli-${data.name}` }));
  mockPrisma.customer.update.mockResolvedValue({});
  mockPrisma.credit.create.mockResolvedValue({ id: 'cr-1' });
  // La transacción corre el callback con el mismo cliente simulado.
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn({
    credit: mockPrisma.credit,
    customer: mockPrisma.customer,
  }));
});

describe('plantilla de fiados', () => {
  it('trae las columnas que el import espera, con la identificación', async () => {
    const res = await request(app)
      .get('/api/v1/credits/import-template')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((r, cb) => {
        const trozos: Buffer[] = [];
        r.on('data', (t: Buffer) => trozos.push(t));
        r.on('end', () => cb(null, Buffer.concat(trozos)));
      });

    expect(res.status).toBe(200);
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (wb.xlsx.load as any)(res.body);
    const headers: string[] = [];
    wb.worksheets[0].getRow(1).eachCell((c) => headers.push(String(c.value)));
    expect(headers).toEqual(ENCABEZADOS);
  });
});

describe('importar fiados', () => {
  it('exige la columna del cliente', async () => {
    const res = await subir(await excel([['Valor total'], [50000]]));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('cliente');
  });

  it('exige la columna del valor', async () => {
    const res = await subir(await excel([['Cliente'], ['María Gómez']]));
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('valor');
  });

  it('la vista previa no escribe nada', async () => {
    const buf = await excel([ENCABEZADOS, ['María Gómez', '1085248963', '3001112233', 'FAC-1', 150000, 0, '', '']]);
    const res = await subir(buf, '?dryRun=true');

    expect(res.status).toBe(200);
    expect(res.body.data.valid).toBe(1);
    expect(mockPrisma.credit.create).not.toHaveBeenCalled();
    expect(mockPrisma.customer.create).not.toHaveBeenCalled();
  });

  it('crea el fiado y calcula el saldo', async () => {
    const buf = await excel([ENCABEZADOS, ['Pedro Ramírez', '98765432', '', 'FAC-877', 80000, 30000, '', '']]);
    const res = await subir(buf);

    expect(res.status).toBe(200);
    const data = mockPrisma.credit.create.mock.calls[0][0].data;
    expect(data.totalAmount).toBe(80000);
    expect(data.paidAmount).toBe(30000);
    expect(data.balance).toBe(50000);
    expect(data.status).toBe('PARTIAL'); // ya tiene un abono
  });

  it('la deuda del cliente sube por el SALDO, no por el total', async () => {
    // Si la fila trae abonos, esa plata ya entró: cobrarla otra vez le inflaría
    // la deuda al cliente.
    const buf = await excel([ENCABEZADOS, ['Pedro Ramírez', '98765432', '', '', 80000, 30000, '', '']]);
    await subir(buf);

    expect(mockPrisma.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentDebt: { increment: 50000 } } }),
    );
  });

  it('un fiado ya pagado no le suma deuda al cliente', async () => {
    const buf = await excel([ENCABEZADOS, ['Ana', '111', '', '', 50000, 50000, '', '']]);
    await subir(buf);

    expect(mockPrisma.credit.create.mock.calls[0][0].data.status).toBe('PAID');
    const subeDeuda = mockPrisma.customer.update.mock.calls
      .some((c) => c[0]?.data?.currentDebt);
    expect(subeDeuda).toBe(false);
  });

  it('dos clientes con el MISMO nombre pero distinta cédula no se cruzan', async () => {
    // El caso que reportó un cliente: por nombre, los fiados de uno terminaban
    // en la cuenta del otro.
    const buf = await excel([
      ['Cliente', 'Identificación', 'Valor total'],
      ['Franklin Vargas', '1085248963', 50000],
      ['Franklin Vargas', '1085248964', 250000],
    ]);
    const res = await subir(buf);

    expect(res.body.data.clientesCreados).toBe(2);
    const docs = mockPrisma.customer.create.mock.calls.map((c) => c[0].data.document);
    expect(docs).toEqual(['1085248963', '1085248964']);
  });

  it('la misma cédula escrita de dos formas es UN solo cliente', async () => {
    const buf = await excel([
      ['Cliente', 'Identificación', 'Valor total'],
      ['Distribuidora Andina', '900.123.456-7', 50000],
      ['Distribuidora Andina SAS', '9001234567', 250000],
    ]);
    const res = await subir(buf);

    expect(res.body.data.clientesCreados).toBe(1);
    expect(res.body.data.imported).toBe(2);
  });

  it('sin columna de identificación empareja por nombre, como antes', async () => {
    const buf = await excel([['Cliente', 'Valor total'], ['María Gómez', 50000]]);
    const res = await subir(buf);

    expect(res.status).toBe(200);
    expect(res.body.data.imported).toBe(1);
    expect(mockPrisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'María Gómez', document: null }) }),
    );
  });

  it('lee montos escritos con puntos de miles', async () => {
    const buf = await excel([ENCABEZADOS, ['Ana', '', '', '', '1.500.000', '', '', '']]);
    await subir(buf);

    expect(mockPrisma.credit.create.mock.calls[0][0].data.totalAmount).toBe(1_500_000);
  });

  it.each([
    ['2026-10-15', '2026-10-15'],
    ['15/10/2026', '2026-10-15'],
  ])('entiende la fecha %s', async (escrita, esperada) => {
    const buf = await excel([ENCABEZADOS, ['Ana', '', '', '', 50000, 0, escrita, '']]);
    await subir(buf);

    const fecha = mockPrisma.credit.create.mock.calls[0][0].data.dueDate as Date;
    expect(fecha.toISOString().slice(0, 10)).toBe(esperada);
  });

  it('una fila sin valor no se importa, pero no bota el resto', async () => {
    const buf = await excel([
      ENCABEZADOS,
      ['Sin monto', '', '', '', '', '', '', ''],
      ['Con monto', '', '', '', 50000, 0, '', ''],
    ]);
    const res = await subir(buf);

    expect(res.body.data.imported).toBe(1);
    expect(res.body.data.errors).toHaveLength(1);
  });

  it('guarda el teléfono del cliente nuevo, para poder cobrarle', async () => {
    const buf = await excel([ENCABEZADOS, ['Nuevo', '123', '3001112233', '', 50000, 0, '', '']]);
    await subir(buf);

    expect(mockPrisma.customer.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ phone: '3001112233' }) }),
    );
  });
});
