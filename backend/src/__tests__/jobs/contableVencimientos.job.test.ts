import { prisma } from '../../config/database';
import { notifyContableVencimientos } from '../../services/notification.service';
import { run, momentoDelAviso, startContableVencimientosJob } from '../../jobs/contableVencimientos.job';

// Este es el corazón de Ventrix Contable: si deja de sonar, el contador se entera
// tarde de un vencimiento y su cliente paga sanción. Corre CADA HORA, así que
// también importa que no trabaje de más: si ninguna oficina pidió aviso a esa
// hora, no debe ni tocar la tabla de vencimientos.
//
// El servicio de notificaciones ya tiene su propia prueba (services/
// vencimientosPush.test.ts); aquí se prueba el job: a quién consulta, qué le
// pasa al servicio y cómo clasifica la cuenta regresiva.

jest.mock('../../config/database', () => ({
  prisma: {
    business: { findMany: jest.fn().mockResolvedValue([]) },
    vencimiento: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

jest.mock('../../services/notification.service', () => ({
  notifyContableVencimientos: jest.fn().mockResolvedValue(1),
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('node-cron', () => ({ schedule: jest.fn() }));

const mockPrisma = prisma as unknown as {
  business: { findMany: jest.Mock };
  vencimiento: { findMany: jest.Mock };
};
const mockNotify = notifyContableVencimientos as jest.Mock;

/** Fecha a N días de hoy en Colombia, como medianoche UTC (igual que la agenda). */
function fechaEnDias(dias: number): Date {
  const s = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + dias * 86_400_000);
}

const venc = (id: string, dias: number, businessId = 'ofi-1', obligacion = 'iva') => ({
  id, obligacion, periodo: 'Bimestre 3', fecha: fechaEnDias(dias),
  taxClient: { razonSocial: 'Panadería El Trigo SAS', businessId },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.business.findMany.mockResolvedValue([]);
  mockPrisma.vencimiento.findMany.mockResolvedValue([]);
  mockNotify.mockResolvedValue(1);
});

describe('contableVencimientos — a quién le toca aviso', () => {
  it('si ninguna oficina pidió aviso a esta hora, ni consulta los vencimientos', async () => {
    mockPrisma.business.findMany.mockResolvedValue([]);

    await run(7);

    expect(mockPrisma.vencimiento.findMany).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('busca solo oficinas contables que tengan esta hora en su horario', async () => {
    await run(14);

    const where = mockPrisma.business.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('contable');
    expect(where.deletedAt).toBeNull();
    expect(where.vencAvisoHoras).toEqual({ has: 14 });
  });

  it('solo mira lo que sigue sin presentar', async () => {
    mockPrisma.business.findMany.mockResolvedValue([{ id: 'ofi-1', vencAvisoHoras: [7] }]);

    await run(7);

    const where = mockPrisma.vencimiento.findMany.mock.calls[0][0].where;
    expect(where.estado).toEqual({ notIn: ['presentada', 'pagada'] });
    expect(where.taxClient).toEqual({ businessId: { in: ['ofi-1'] } });
  });

  it('cada oficina recibe únicamente los vencimientos de sus clientes', async () => {
    mockPrisma.business.findMany.mockResolvedValue([
      { id: 'ofi-1', vencAvisoHoras: [7] },
      { id: 'ofi-2', vencAvisoHoras: [7] },
    ]);
    mockPrisma.vencimiento.findMany.mockResolvedValue([
      venc('v1', 1, 'ofi-1'), venc('v2', 1, 'ofi-2'), venc('v3', 2, 'ofi-1'),
    ]);

    await run(7);

    expect(mockNotify).toHaveBeenCalledTimes(2);
    const porOficina = Object.fromEntries(mockNotify.mock.calls.map((c) => [c[0], c[1]]));
    expect(porOficina['ofi-1'].map((i: { id: string }) => i.id)).toEqual(['v1', 'v3']);
    expect(porOficina['ofi-2'].map((i: { id: string }) => i.id)).toEqual(['v2']);
  });
});

describe('contableVencimientos — cómo cuenta los días', () => {
  beforeEach(() => {
    mockPrisma.business.findMany.mockResolvedValue([{ id: 'ofi-1', vencAvisoHoras: [7] }]);
  });

  it.each([
    [5, 'previo', 'vence en 5 días'],
    [2, 'cerca', 'vence en 2 días'],
    [1, 'cerca', 'vence en 1 día'],
    [0, 'hoy', 'vence HOY'],
  ])('a %i día(s) lo marca como "%s"', async (dias, hito, texto) => {
    mockPrisma.vencimiento.findMany.mockResolvedValue([venc('v1', dias)]);

    await run(7);

    const item = mockNotify.mock.calls[0][1][0];
    expect(item.hito).toBe(hito);
    expect(item.mensaje).toContain(texto);
  });

  it('lo ya vencido lo dice con los días que lleva encima', async () => {
    mockPrisma.vencimiento.findMany.mockResolvedValue([venc('v1', -3)]);

    await run(7);

    const item = mockNotify.mock.calls[0][1][0];
    expect(item.hito).toBe('vencido');
    expect(item.titulo).toContain('Vencido');
    expect(item.mensaje).toContain('venció hace 3 días');
  });

  it('escribe bien el singular de un solo día', async () => {
    mockPrisma.vencimiento.findMany.mockResolvedValue([venc('v1', -1)]);

    await run(7);

    expect(mockNotify.mock.calls[0][1][0].mensaje).toContain('hace 1 día (');
  });

  it('nombra la obligación como la conoce el contador, no con el código interno', async () => {
    mockPrisma.vencimiento.findMany.mockResolvedValue([venc('v1', 1, 'ofi-1', 'retefuente')]);

    await run(7);

    const item = mockNotify.mock.calls[0][1][0];
    expect(item.titulo).toContain('Retención en la fuente');
    expect(item.mensaje).toContain('Panadería El Trigo SAS');
  });

  it.each([
    ['pila', '/contable/pila'],
    ['exogena', '/contable/exogena'],
    ['iva', '/contable/vencimientos'],
  ])('el aviso de %s lleva a su propia pantalla', async (obligacion, href) => {
    mockPrisma.vencimiento.findMany.mockResolvedValue([venc('v1', 1, 'ofi-1', obligacion)]);

    await run(7);

    expect(mockNotify.mock.calls[0][1][0].href).toBe(href);
  });
});

describe('contableVencimientos — la franja del día', () => {
  it('con una sola hora configurada, siempre es el panorama', () => {
    expect(momentoDelAviso([7], 7)).toBe('panorama');
  });

  it('reparte panorama / pendientes / cierre según la posición de la hora', () => {
    const horas = [7, 14, 18];
    expect(momentoDelAviso(horas, 7)).toBe('panorama');
    expect(momentoDelAviso(horas, 14)).toBe('pendientes');
    expect(momentoDelAviso(horas, 18)).toBe('cierre');
  });

  it('no depende de que el horario venga ordenado', () => {
    const desordenado = [18, 7, 14];
    expect(momentoDelAviso(desordenado, 7)).toBe('panorama');
    expect(momentoDelAviso(desordenado, 18)).toBe('cierre');
  });

  it('le pasa al servicio la franja y la hora de esa oficina', async () => {
    mockPrisma.business.findMany.mockResolvedValue([{ id: 'ofi-1', vencAvisoHoras: [7, 14, 18] }]);
    mockPrisma.vencimiento.findMany.mockResolvedValue([venc('v1', 0)]);

    await run(18);

    const [, , momento, hora] = mockNotify.mock.calls[0];
    expect(momento).toBe('cierre');
    expect(hora).toBe(18);
  });
});

describe('contableVencimientos — cuando algo falla', () => {
  it('si una oficina falla, las demás igual reciben su aviso', async () => {
    mockPrisma.business.findMany.mockResolvedValue([
      { id: 'ofi-1', vencAvisoHoras: [7] },
      { id: 'ofi-2', vencAvisoHoras: [7] },
    ]);
    mockPrisma.vencimiento.findMany.mockResolvedValue([venc('v1', 1, 'ofi-1'), venc('v2', 1, 'ofi-2')]);
    mockNotify.mockRejectedValueOnce(new Error('push caído')).mockResolvedValueOnce(1);

    await expect(run(7)).resolves.not.toThrow();

    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  it('si la base falla, no tumba el proceso', async () => {
    mockPrisma.business.findMany.mockRejectedValue(new Error('base caída'));

    await expect(run(7)).resolves.not.toThrow();
  });

  it('queda programado cada hora en punto', () => {
    startContableVencimientosJob();
    const cron = jest.requireMock('node-cron');
    // Cada hora, no una vez al día: adentro se filtra qué oficinas toca.
    expect(cron.schedule).toHaveBeenCalledWith('0 * * * *', expect.any(Function));
  });
});
