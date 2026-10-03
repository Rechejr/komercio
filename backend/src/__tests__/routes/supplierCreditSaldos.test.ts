import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

// Saldos acumulados de cuentas por pagar: cuánto le debe el negocio a cada
// proveedor EN TOTAL. Lo que importa es que la cifra acumulada sea siempre la
// suma exacta de las facturas que se verían en el listado detallado con el
// mismo filtro.

jest.mock('../../config/database', () => ({
  prisma: {
    supplierCredit: { groupBy: jest.fn(), findMany: jest.fn() },
    supplier: { findMany: jest.fn() },
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
  supplierCredit: { groupBy: jest.Mock; findMany: jest.Mock };
  supplier: { findMany: jest.Mock };
  business: { findUnique: jest.Mock };
};

const token = jwtUtils.generateAccessToken({
  userId: 'u-1', email: 'due@no.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'br-1',
});

const pedir = (query = '') =>
  request(app).get(`/api/v1/supplier-credits/saldos${query}`).set('Authorization', `Bearer ${token}`);

/** Un proveedor con TRES facturas y otro con una sola, ya pagada. */
function conDeuda() {
  mockPrisma.supplierCredit.groupBy
    // 1ª llamada: las cifras, sobre todas las facturas del filtro.
    .mockResolvedValueOnce([
      { supplierId: 'prov-b', _sum: { totalAmount: 90000, paidAmount: 90000, balance: 0 }, _count: { _all: 1 } },
      { supplierId: 'prov-a', _sum: { totalAmount: 1200000, paidAmount: 300000, balance: 900000 }, _count: { _all: 3 } },
    ])
    // 2ª llamada: el próximo vencimiento, solo de lo que aún se debe.
    .mockResolvedValueOnce([
      { supplierId: 'prov-a', _min: { dueDate: new Date('2026-10-12T05:00:00Z') } },
    ]);
  mockPrisma.supplierCredit.findMany.mockResolvedValue([
    { supplierId: 'prov-a', invoiceNumber: 'FC-100', purchase: null },
    { supplierId: 'prov-a', invoiceNumber: null, purchase: { invoiceNumber: 'FC-101' } },
    { supplierId: 'prov-a', invoiceNumber: 'FC-102', purchase: null },
    { supplierId: 'prov-b', invoiceNumber: 'FC-200', purchase: null },
  ]);
  mockPrisma.supplier.findMany.mockResolvedValue([
    { id: 'prov-a', name: 'Distribuidora Andina', document: '900123456-7', phone: null, mobile: '3001112233' },
    { id: 'prov-b', name: 'Maderas del Norte', document: null, phone: null, mobile: null },
  ]);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.business.findUnique.mockResolvedValue({ plan: 'pro', planExpiresAt: null });
});

describe('GET /supplier-credits/saldos', () => {
  it('junta las facturas de un proveedor en una sola fila', async () => {
    conDeuda();
    const res = await pedir();

    expect(res.status).toBe(200);
    const andina = res.body.data.proveedores.find((p: any) => p.supplier.id === 'prov-a');
    expect(andina.facturas).toBe(3);
    expect(andina.balance).toBe(900000);
    expect(andina.paidAmount).toBe(300000);
    expect(andina.supplier.name).toBe('Distribuidora Andina');
  });

  it('ordena por saldo: a quien más se le debe queda arriba', async () => {
    conDeuda();
    const res = await pedir();

    expect(res.body.data.proveedores.map((p: any) => p.supplier.id)).toEqual(['prov-a', 'prov-b']);
  });

  it('los totales suman toda la deuda filtrada', async () => {
    conDeuda();
    const res = await pedir();

    expect(res.body.data.totals).toEqual({
      proveedores: 2, facturas: 4, totalAmount: 1290000, paidAmount: 390000, balance: 900000,
    });
  });

  it('el próximo vencimiento sale solo de lo que todavía se debe', async () => {
    conDeuda();
    const res = await pedir();

    const segunda = mockPrisma.supplierCredit.groupBy.mock.calls[1][0];
    expect(segunda.where.balance).toEqual({ gt: 0 });

    const andina = res.body.data.proveedores.find((p: any) => p.supplier.id === 'prov-a');
    expect(andina.proximoVencimiento).toBe('2026-10-12T05:00:00.000Z');
    // Maderas ya está al día: no tiene nada por vencer.
    const maderas = res.body.data.proveedores.find((p: any) => p.supplier.id === 'prov-b');
    expect(maderas.proximoVencimiento).toBeNull();
  });

  it('manda los números de factura para que el buscador por factura también sirva', async () => {
    conDeuda();
    const res = await pedir();

    const andina = res.body.data.proveedores.find((p: any) => p.supplier.id === 'prov-a');
    // Incluye tanto las importadas (número propio) como las de una compra.
    expect(andina.numeros.sort()).toEqual(['FC-100', 'FC-101', 'FC-102']);
  });

  it('solo cuenta las cuentas del negocio y no las anuladas', async () => {
    conDeuda();
    await pedir();

    const where = mockPrisma.supplierCredit.groupBy.mock.calls[0][0].where;
    expect(where.businessId).toBe('biz-1');
    expect(where.deletedAt).toBeNull();
  });

  it('usa los mismos filtros que el listado detallado', async () => {
    conDeuda();
    await pedir('?status=PENDING&supplierId=prov-a&startDate=2026-10-01&endDate=2026-10-31');

    const where = mockPrisma.supplierCredit.groupBy.mock.calls[0][0].where;
    expect(where.status).toBe('PENDING');
    expect(where.supplierId).toBe('prov-a');
    // El rango se interpreta en hora de Colombia, no en UTC.
    expect(where.createdAt.gte.toISOString()).toBe('2026-10-01T05:00:00.000Z');
    expect(where.createdAt.lte.toISOString()).toBe('2026-11-01T04:59:59.999Z');
  });

  it('sin cuentas devuelve la lista vacía y totales en cero', async () => {
    mockPrisma.supplierCredit.groupBy.mockResolvedValue([]);
    mockPrisma.supplierCredit.findMany.mockResolvedValue([]);
    mockPrisma.supplier.findMany.mockResolvedValue([]);

    const res = await pedir();

    expect(res.body.data.proveedores).toEqual([]);
    expect(res.body.data.totals.balance).toBe(0);
  });

  it('pide los datos de los proveedores en una sola consulta', async () => {
    conDeuda();
    await pedir();

    expect(mockPrisma.supplier.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.supplier.findMany.mock.calls[0][0].where.id.in.sort())
      .toEqual(['prov-a', 'prov-b']);
  });

  it('exige sesión', async () => {
    const res = await request(app).get('/api/v1/supplier-credits/saldos');
    expect(res.status).toBe(401);
  });
});
