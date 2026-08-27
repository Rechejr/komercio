import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { limpiarNotificaciones, startNotificationCleanupJob } from '../../jobs/notificationCleanup.job';

// Borrar avisos es delicado: si se borra uno que todavía se puede volver a
// generar, el aviso vuelve a sonar; y si se borra uno sin leer demasiado
// pronto, alguien se pierde algo que nunca vio. Por eso hay dos plazos y esta
// prueba vigila que no se crucen.

jest.mock('../../config/database', () => ({
  prisma: { notification: { deleteMany: jest.fn() } },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

let cronCallback: () => void;
jest.mock('node-cron', () => ({
  schedule: jest.fn((_expr: string, cb: () => void) => { cronCallback = cb; }),
}));

const mockPrisma = prisma as unknown as { notification: { deleteMany: jest.Mock } };
const tick = () => new Promise((r) => setImmediate(r));
const DIA_MS = 24 * 60 * 60 * 1000;

/** Días hacia atrás que representa una fecha de corte. */
const diasAtras = (fecha: Date) => Math.round((Date.now() - fecha.getTime()) / DIA_MS);

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
});

describe('limpieza de notificaciones', () => {
  it('borra las leídas de hace más de 60 días', async () => {
    await limpiarNotificaciones();

    const where = mockPrisma.notification.deleteMany.mock.calls[0][0].where;
    expect(where.isRead).toBe(true);
    expect(diasAtras(where.createdAt.lt)).toBe(60);
  });

  it('a las NO leídas les da mucho más tiempo', async () => {
    await limpiarNotificaciones();

    const where = mockPrisma.notification.deleteMany.mock.calls[1][0].where;
    expect(where.isRead).toBe(false);
    expect(diasAtras(where.createdAt.lt)).toBe(180);
  });

  it('nunca borra un aviso reciente, leído o no', async () => {
    await limpiarNotificaciones();

    // Las dos fechas de corte tienen que estar en el pasado: si alguna quedara
    // en el futuro, la limpieza se llevaría los avisos del día.
    for (const llamada of mockPrisma.notification.deleteMany.mock.calls) {
      expect(llamada[0].where.createdAt.lt.getTime()).toBeLessThan(Date.now());
    }
  });

  it('el plazo de las no leídas es mayor que el de las leídas', async () => {
    await limpiarNotificaciones();

    const [leidas, sinLeer] = mockPrisma.notification.deleteMany.mock.calls;
    // Borrar algo que nadie vio es más delicado que borrar algo ya visto.
    expect(sinLeer[0].where.createdAt.lt.getTime())
      .toBeLessThan(leidas[0].where.createdAt.lt.getTime());
  });

  it('las no leídas sobreviven más que el vencimiento que las originó', async () => {
    // Los vencimientos cumplidos se purgan a los 2 meses. Con 180 días, cuando
    // se borra el aviso su evento ya no existe, así que no se puede regenerar.
    await limpiarNotificaciones();

    const sinLeer = mockPrisma.notification.deleteMany.mock.calls[1][0].where;
    expect(diasAtras(sinLeer.createdAt.lt)).toBeGreaterThan(60);
  });

  it('informa cuántas borró de cada tipo', async () => {
    mockPrisma.notification.deleteMany
      .mockResolvedValueOnce({ count: 120 })
      .mockResolvedValueOnce({ count: 8 });

    expect(await limpiarNotificaciones()).toEqual({ leidas: 120, sinLeer: 8 });
  });
});

describe('programación de la limpieza', () => {
  beforeEach(() => startNotificationCleanupJob());

  it('corre los domingos de madrugada', () => {
    const cron = jest.requireMock('node-cron');
    expect(cron.schedule).toHaveBeenCalledWith('0 8 * * 0', expect.any(Function));
  });

  it('solo deja rastro si borró algo', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });
    cronCallback();
    await tick();
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('borrada'));
  });

  it('si la base falla, lo anota y no tumba el proceso', async () => {
    mockPrisma.notification.deleteMany.mockRejectedValue(new Error('base caída'));

    expect(() => cronCallback()).not.toThrow();
    await tick();

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('limpieza de notificaciones falló'));
  });
});
