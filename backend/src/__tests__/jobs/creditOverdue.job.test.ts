import { prisma } from '../../config/database';
import { notifyCreditsOverdueBatch } from '../../services/notification.service';
import { emitToBusinesss } from '../../config/socket';
import { startCreditOverdueJob } from '../../jobs/creditOverdue.job';

jest.mock('../../config/database', () => ({
  prisma: {
    credit: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock('../../services/notification.service', () => ({
  notifyCreditsOverdueBatch: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../config/socket', () => ({
  emitToBusinesss: jest.fn(),
  socketEvents: { CREDIT_OVERDUE: 'credit_overdue' },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

let cronCallback: () => Promise<void>;
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expr: string, cb: () => Promise<void>) => { cronCallback = cb; }),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockNotify = notifyCreditsOverdueBatch as jest.Mock;

describe('creditOverdue job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    startCreditOverdueJob();
  });

  it('no hace nada si no hay créditos vencidos', async () => {
    (mockPrisma.credit.findMany as jest.Mock).mockResolvedValue([]);
    await cronCallback();
    expect(mockPrisma.credit.updateMany).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('marca como vencidos y notifica agrupado por negocio', async () => {
    (mockPrisma.credit.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', balance: 50000, customer: { name: 'Juan', businessId: 'biz-1' } },
      { id: 'c2', balance: 30000, customer: { name: 'Ana', businessId: 'biz-1' } },
      { id: 'c3', balance: 20000, customer: { name: 'Pedro', businessId: 'biz-2' } },
    ]);
    (mockPrisma.credit.updateMany as jest.Mock).mockResolvedValue({ count: 3 });

    await cronCallback();

    expect(mockPrisma.credit.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1', 'c2', 'c3'] } },
      data: { status: 'OVERDUE' },
    });
    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith('biz-1', [
      { id: 'c1', customerName: 'Juan', balance: 50000 },
      { id: 'c2', customerName: 'Ana', balance: 30000 },
    ]);
    expect(mockNotify).toHaveBeenCalledWith('biz-2', [
      { id: 'c3', customerName: 'Pedro', balance: 20000 },
    ]);
    expect(emitToBusinesss).toHaveBeenCalledTimes(2);
  });

  it('no truena si notifyCreditsOverdueBatch falla para un negocio', async () => {
    (mockPrisma.credit.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', balance: 1000, customer: { name: 'Juan', businessId: 'biz-1' } },
    ]);
    (mockPrisma.credit.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
    mockNotify.mockRejectedValueOnce(new Error('fallo de red'));

    await expect(cronCallback()).resolves.not.toThrow();
  });

  it('ignora créditos cuyo cliente no tiene businessId', async () => {
    (mockPrisma.credit.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', balance: 1000, customer: { name: 'Sin negocio', businessId: null } },
    ]);
    (mockPrisma.credit.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await cronCallback();

    expect(mockNotify).not.toHaveBeenCalled();
  });
});
