import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { startDowngradeExpiredPlansJob } from '../../jobs/downgradeExpiredPlans.job';

// Este proceso le baja el plan a negocios de clientes que PAGAN. Un error en el
// filtro no se nota en el momento: alguien al día amanece en gratuito, pierde
// funciones y se va sin reclamar. Por eso lo que más se prueba aquí es a quién
// NO debe tocar.

jest.mock('../../config/database', () => ({
  prisma: { business: { updateMany: jest.fn() } },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let cronCallback: () => void;
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expr: string, cb: () => void) => { cronCallback = cb; }),
}));

const mockPrisma = prisma as unknown as { business: { updateMany: jest.Mock } };

/** Espera a que se vacíe la cola de promesas (el cron llama a run() sin await). */
const tick = () => new Promise((r) => setImmediate(r));

describe('downgradeExpiredPlans job', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Se finge el reloj para no esperar los 25 s de la pasada de arranque, pero
    // se deja setImmediate real: es lo que usa `tick()` para vaciar la cola de
    // promesas, y fingido nunca se resolvería.
    jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
    mockPrisma.business.updateMany.mockResolvedValue({ count: 0 });
    startDowngradeExpiredPlansJob();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('solo degrada negocios POS con Pro ya vencido', async () => {
    cronCallback();
    await tick();

    const { where, data } = mockPrisma.business.updateMany.mock.calls[0][0];
    expect(data).toEqual({ plan: 'free' });
    expect(where.type).toBe('pos');
    expect(where.plan).toBe('pro');
    expect(where.deletedAt).toBeNull();
    // La fecha de corte es AHORA: nunca una futura, que degradaría a quien está al día.
    expect(where.planExpiresAt.lt).toBeInstanceOf(Date);
    expect(where.planExpiresAt.lt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('no toca a quien no tiene fecha de vencimiento', async () => {
    cronCallback();
    await tick();

    // `not: null` deja fuera a los planes sin vencimiento (cortesía, vitalicios).
    expect(mockPrisma.business.updateMany.mock.calls[0][0].where.planExpiresAt.not).toBeNull();
  });

  it('no toca las cuentas de Contable', async () => {
    cronCallback();
    await tick();

    // La Agenda contable maneja su vigencia por planExpiresAt en cada petición,
    // no por este campo: si este job la tocara, apagaría cuentas al día.
    expect(mockPrisma.business.updateMany.mock.calls[0][0].where.type).toBe('pos');
    expect(mockPrisma.business.updateMany.mock.calls[0][0].where.type).not.toBe('contable');
  });

  it('solo deja rastro en el registro si degradó algo', async () => {
    mockPrisma.business.updateMany.mockResolvedValue({ count: 0 });
    cronCallback();
    await tick();
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('downgradeExpiredPlans:'));

    (logger.info as jest.Mock).mockClear();
    mockPrisma.business.updateMany.mockResolvedValue({ count: 3 });
    cronCallback();
    await tick();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('3 negocio(s)'));
  });

  it('si la base falla, lo anota y no tumba el proceso', async () => {
    mockPrisma.business.updateMany.mockRejectedValue(new Error('conexión caída'));

    // Que no lance: node-cron no atrapa nada, una excepción aquí mataría el job.
    expect(() => cronCallback()).not.toThrow();
    await tick();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('downgradeExpiredPlans falló'));
  });

  it('hace una pasada al arrancar, sin esperar a la madrugada', async () => {
    expect(mockPrisma.business.updateMany).not.toHaveBeenCalled();

    jest.advanceTimersByTime(25_000);
    await tick();

    // Al desplegar, corrige de una los que vencieron mientras estaba caído.
    expect(mockPrisma.business.updateMany).toHaveBeenCalledTimes(1);
  });

  it('queda programado a diario', () => {
    const cron = jest.requireMock('node-cron');
    expect(cron.schedule).toHaveBeenCalledWith('0 1 * * *', expect.any(Function));
  });
});
