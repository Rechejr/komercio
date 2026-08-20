import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { notifyDueSoonBatch } from '../../services/notification.service';
import { startDueSoonJob } from '../../jobs/dueSoon.job';

// Avisa de fiados por cobrar y cuentas por pagar que vencen dentro de 3 días.
// Lo que importa: que cada negocio vea SOLO lo suyo, que el texto diga bien
// cuándo vence, y que un fallo en un negocio no deje sin aviso a los demás.

jest.mock('../../config/database', () => ({
  prisma: {
    credit: { findMany: jest.fn().mockResolvedValue([]) },
    supplierCredit: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../../services/notification.service', () => ({
  notifyDueSoonBatch: jest.fn().mockResolvedValue(1),
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let cronCallback: () => Promise<void>;
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expr: string, cb: () => Promise<void>) => { cronCallback = cb; }),
}));

const mockPrisma = prisma as unknown as {
  credit: { findMany: jest.Mock };
  supplierCredit: { findMany: jest.Mock };
};
const mockNotify = notifyDueSoonBatch as jest.Mock;

const enDias = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000);

const fiado = (id: string, businessId: string, dias: number, nombre = 'Juan Pérez') => ({
  id, balance: 50000, dueDate: enDias(dias),
  customer: { name: nombre, businessId },
});

const porPagar = (id: string, businessId: string, dias: number, proveedor = 'Distribuidora XYZ') => ({
  id, balance: 120000, dueDate: enDias(dias), businessId,
  supplier: { name: proveedor },
});

describe('dueSoon job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.credit.findMany.mockResolvedValue([]);
    mockPrisma.supplierCredit.findMany.mockResolvedValue([]);
    mockNotify.mockResolvedValue(1);
    startDueSoonJob();
  });

  it('sin nada por vencer no manda avisos', async () => {
    await cronCallback();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('busca solo lo pendiente que vence dentro de los próximos 3 días', async () => {
    await cronCallback();

    const where = mockPrisma.credit.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['PENDING', 'PARTIAL'] });
    expect(where.deletedAt).toBeNull();
    // La ventana arranca HOY: lo ya vencido no entra aquí (eso es otro aviso).
    const dias = (where.dueDate.lte.getTime() - where.dueDate.gte.getTime()) / 86_400_000;
    expect(Math.round(dias)).toBe(3);
  });

  it('separa lo que se cobra de lo que se paga', async () => {
    mockPrisma.credit.findMany.mockResolvedValue([fiado('c1', 'biz-1', 2)]);
    mockPrisma.supplierCredit.findMany.mockResolvedValue([porPagar('p1', 'biz-1', 2)]);

    await cronCallback();

    const tipos = mockNotify.mock.calls.map((c) => c[1]);
    expect(tipos).toContain('CREDIT_DUE_SOON');
    expect(tipos).toContain('PAYABLE_DUE_SOON');
  });

  it('a cada negocio solo le llega lo suyo', async () => {
    mockPrisma.credit.findMany.mockResolvedValue([
      fiado('c1', 'biz-1', 1, 'Juan'),
      fiado('c2', 'biz-2', 1, 'Ana'),
    ]);

    await cronCallback();

    expect(mockNotify).toHaveBeenCalledTimes(2);
    for (const [businessId, , items] of mockNotify.mock.calls) {
      expect(items).toHaveLength(1);
      const esperado = businessId === 'biz-1' ? 'Juan' : 'Ana';
      expect(items[0].message).toContain(esperado);
    }
  });

  it.each([
    [0, 'hoy'],
    [1, 'mañana'],
    [3, 'en 3 días'],
  ])('a %i día(s) dice que vence %s', async (dias, texto) => {
    mockPrisma.credit.findMany.mockResolvedValue([fiado('c1', 'biz-1', dias)]);

    await cronCallback();

    expect(mockNotify.mock.calls[0][2][0].message).toContain(texto);
  });

  it('el aviso lleva el saldo con formato de plata', async () => {
    mockPrisma.credit.findMany.mockResolvedValue([fiado('c1', 'biz-1', 1)]);

    await cronCallback();

    const item = mockNotify.mock.calls[0][2][0];
    expect(item.message).toContain('$50.000');
    expect(item.href).toBe('/creditos');
    expect(item.refId).toBe('c1'); // el id sirve de dedup en el servicio
  });

  it('la cuenta por pagar apunta a su propia pantalla', async () => {
    mockPrisma.supplierCredit.findMany.mockResolvedValue([porPagar('p1', 'biz-1', 1)]);

    await cronCallback();

    const item = mockNotify.mock.calls[0][2][0];
    expect(item.href).toBe('/cuentas-por-pagar');
    expect(item.message).toContain('Distribuidora XYZ');
  });

  it('ignora registros sin negocio o sin fecha', async () => {
    mockPrisma.credit.findMany.mockResolvedValue([
      { id: 'c1', balance: 1000, dueDate: enDias(1), customer: { name: 'X', businessId: null } },
      { id: 'c2', balance: 1000, dueDate: null, customer: { name: 'Y', businessId: 'biz-1' } },
    ]);

    await cronCallback();

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('si un negocio falla, el otro igual recibe su aviso', async () => {
    mockPrisma.credit.findMany.mockResolvedValue([fiado('c1', 'biz-1', 1), fiado('c2', 'biz-2', 1)]);
    mockNotify.mockRejectedValueOnce(new Error('sin conexión')).mockResolvedValueOnce(1);

    await expect(cronCallback()).resolves.not.toThrow();

    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('biz-1'));
  });

  it('si la base falla, lo anota y no tumba el proceso', async () => {
    mockPrisma.credit.findMany.mockRejectedValue(new Error('base caída'));

    await expect(cronCallback()).resolves.not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('dueSoon falló'), expect.anything());
  });

  it('corre a las 9 a.m. hora de Colombia, no de madrugada', () => {
    const cron = jest.requireMock('node-cron');
    expect(cron.schedule).toHaveBeenCalledWith('0 14 * * *', expect.any(Function));
  });
});
