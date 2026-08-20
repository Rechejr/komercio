import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { notifyLowStockBatch } from '../../services/notification.service';
import { startLowStockSweepJob } from '../../jobs/lowStockSweep.job';

// Barrido diario de stock bajo. Lo delicado es el dedup: si se marcara mal, el
// dueño recibiría la misma alerta todos los días hasta que apague las
// notificaciones — que es justo lo que no queremos.

jest.mock('../../config/database', () => ({
  prisma: {
    $queryRaw: jest.fn(),
    product: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  },
}));

jest.mock('../../services/notification.service', () => ({
  notifyLowStockBatch: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let cronCallback: () => Promise<void>;
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expr: string, cb: () => Promise<void>) => { cronCallback = cb; }),
}));

const mockPrisma = prisma as unknown as { $queryRaw: jest.Mock; product: { updateMany: jest.Mock } };
const mockNotify = notifyLowStockBatch as jest.Mock;

const producto = (id: string, businessId: string, nombre = 'Arroz') => ({
  id, name: nombre, stock: 2, minStock: 5, businessId,
});

describe('lowStockSweep job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.product.updateMany.mockResolvedValue({ count: 0 });
    mockNotify.mockResolvedValue(undefined);
    startLowStockSweepJob();
  });

  it('sin productos bajo mínimo no marca ni avisa nada', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    await cronCallback();

    expect(mockPrisma.product.updateMany).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('marca los productos ANTES de avisar, para no repetir mañana', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([producto('p1', 'biz-1'), producto('p2', 'biz-1', 'Aceite')]);

    await cronCallback();

    const args = mockPrisma.product.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: { in: ['p1', 'p2'] } });
    expect(args.data.lowStockNotifiedAt).toBeInstanceOf(Date);
  });

  it('manda un solo aviso por negocio, con todos sus productos', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      producto('p1', 'biz-1', 'Arroz'),
      producto('p2', 'biz-1', 'Aceite'),
      producto('p3', 'biz-2', 'Panela'),
    ]);

    await cronCallback();

    expect(mockNotify).toHaveBeenCalledTimes(2); // dos negocios, no tres productos
    const [bizA, itemsA] = mockNotify.mock.calls[0];
    expect(bizA).toBe('biz-1');
    expect(itemsA).toHaveLength(2);
    expect(itemsA[0]).toEqual({ id: 'p1', name: 'Arroz', stock: 2, minStock: 5 });
  });

  it('nunca mezcla productos de negocios distintos', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([producto('p1', 'biz-1'), producto('p3', 'biz-2')]);

    await cronCallback();

    for (const [businessId, items] of mockNotify.mock.calls) {
      const esperado = businessId === 'biz-1' ? 'p1' : 'p3';
      expect(items.map((i: { id: string }) => i.id)).toEqual([esperado]);
    }
  });

  it('ignora productos huérfanos, sin negocio', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      producto('p1', 'biz-1'),
      { ...producto('p2', ''), businessId: null },
    ]);

    await cronCallback();

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0]).toBe('biz-1');
  });

  it('si un negocio falla al notificar, los demás igual reciben su aviso', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([producto('p1', 'biz-1'), producto('p3', 'biz-2')]);
    mockNotify.mockRejectedValueOnce(new Error('push caído')).mockResolvedValueOnce(undefined);

    await cronCallback();

    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('biz-1'));
  });

  it('si la consulta falla, lo anota sin tumbar el proceso', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('base caída'));

    await expect(cronCallback()).resolves.not.toThrow();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('lowStockSweep falló'), expect.anything());
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('corre a las 8:30 a.m. hora de Colombia', () => {
    const cron = jest.requireMock('node-cron');
    // 13:30 UTC = 8:30 en Colombia. A primera hora, antes de abrir la tienda.
    expect(cron.schedule).toHaveBeenCalledWith('30 13 * * *', expect.any(Function));
  });
});
