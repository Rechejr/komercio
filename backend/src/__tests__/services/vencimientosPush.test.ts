import { notifyContableVencimientos } from '../../services/notification.service';
import { prisma } from '../../config/database';
import { sendPushToUsers } from '../../config/webpush';

// El contador reportó que los avisos de vencimientos solo los veía al ABRIR la
// app. Eran dos fallas distintas y estas pruebas fijan las dos correcciones:
//   1. el aviso se repetía una sola vez en la vida del vencimiento (se enteraba
//      a 5 días y nunca más, ni el día que vencía);
//   2. el push al móvil solo salía cuando había un aviso nuevo, así que una
//      declaración ya vencida no volvía a sonar nunca.

jest.mock('../../config/database', () => ({
  prisma: {
    user: { findMany: jest.fn() },
    notification: { findMany: jest.fn(), createMany: jest.fn() },
    business: { findUnique: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../../config/webpush', () => ({ sendPushToUsers: jest.fn() }));
jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../config/socket', () => ({ emitToUser: jest.fn(), socketEvents: { NEW_NOTIFICATION: 'notification:new' } }));

const mockPrisma = prisma as unknown as {
  user: { findMany: jest.Mock };
  notification: { findMany: jest.Mock; createMany: jest.Mock };
  business: { findUnique: jest.Mock; update: jest.Mock };
};

const venc = (over: Partial<{ id: string; hito: string }> = {}) => ({
  id: 'v-1', titulo: 'Por vencer: IVA de Comercial S.A.S.',
  mensaje: 'IVA · Bimestre 4 de Comercial S.A.S. vence en 5 días (12 sep).',
  href: '/contable/vencimientos', hito: 'previo', ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.user.findMany.mockResolvedValue([{ id: 'u-contador' }]);
  mockPrisma.notification.findMany.mockResolvedValue([]);
  mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.business.findUnique.mockResolvedValue({ lastVencPushAt: null });
  mockPrisma.business.update.mockResolvedValue({});
});

describe('avisos de vencimientos — campanita por hito', () => {
  it('avisa la primera vez', async () => {
    const creados = await notifyContableVencimientos('biz-1', [venc()]);
    expect(creados).toBe(1);
    expect(mockPrisma.notification.createMany).toHaveBeenCalled();
  });

  it('NO repite el mismo hito', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      { data: { vencimientoId: 'v-1', kind: 'VENC_ALERTA', hito: 'previo' } },
    ]);
    const creados = await notifyContableVencimientos('biz-1', [venc({ hito: 'previo' })]);
    expect(creados).toBe(0);
    expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
  });

  it('vuelve a avisar cuando el vencimiento cambia de etapa', async () => {
    // Ya se avisó a 5 días; ahora vence HOY: tiene que sonar de nuevo.
    mockPrisma.notification.findMany.mockResolvedValue([
      { data: { vencimientoId: 'v-1', kind: 'VENC_ALERTA', hito: 'previo' } },
    ]);
    const creados = await notifyContableVencimientos('biz-1', [venc({ hito: 'hoy' })]);
    expect(creados).toBe(1);
    expect(mockPrisma.notification.createMany.mock.calls[0][0].data[0].data).toMatchObject({ hito: 'hoy' });
  });

  it('recorre las cuatro etapas: previo → cerca → hoy → vencido', async () => {
    const vistos: string[] = [];
    for (const hito of ['previo', 'cerca', 'hoy', 'vencido']) {
      jest.clearAllMocks();
      mockPrisma.user.findMany.mockResolvedValue([{ id: 'u-contador' }]);
      mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });
      mockPrisma.business.findUnique.mockResolvedValue({ lastVencPushAt: null });
      mockPrisma.notification.findMany.mockResolvedValue(
        vistos.map((h) => ({ data: { vencimientoId: 'v-1', kind: 'VENC_ALERTA', hito: h } })),
      );
      const creados = await notifyContableVencimientos('biz-1', [venc({ hito })]);
      expect(creados).toBe(1);
      vistos.push(hito);
    }
  });

  it('las notificaciones viejas (sin hito) cuentan como "previo"', async () => {
    // Al desplegar esto, lo ya notificado no debe repetirse de golpe.
    mockPrisma.notification.findMany.mockResolvedValue([
      { data: { vencimientoId: 'v-1', kind: 'VENC_ALERTA' } },
    ]);
    expect(await notifyContableVencimientos('biz-1', [venc({ hito: 'previo' })])).toBe(0);
  });
});

describe('push al móvil — recordatorio diario', () => {
  it('suena aunque NO haya avisos nuevos: lo vencido sigue vencido mañana', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([
      { data: { vencimientoId: 'v-1', kind: 'VENC_ALERTA', hito: 'vencido' } },
    ]);

    const creados = await notifyContableVencimientos('biz-1', [venc({ hito: 'vencido' })]);

    expect(creados).toBe(0); // nada nuevo en la campanita...
    expect(sendPushToUsers).toHaveBeenCalledTimes(1); // ...pero el celular sí suena
    expect(mockPrisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'biz-1' } }),
    );
  });

  it('NO vuelve a sonar el mismo día (un reinicio del servidor no debe repetirlo)', async () => {
    mockPrisma.business.findUnique.mockResolvedValue({ lastVencPushAt: new Date() });
    await notifyContableVencimientos('biz-1', [venc()]);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it('vuelve a sonar al día siguiente', async () => {
    const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);
    mockPrisma.business.findUnique.mockResolvedValue({ lastVencPushAt: ayer });
    await notifyContableVencimientos('biz-1', [venc()]);
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
  });

  it('resume cuántas están vencidas y cuántas por vencer', async () => {
    await notifyContableVencimientos('biz-1', [
      venc({ id: 'v-1', hito: 'vencido' }),
      venc({ id: 'v-2', hito: 'vencido' }),
      venc({ id: 'v-3', hito: 'hoy' }),
    ]);
    const payload = (sendPushToUsers as jest.Mock).mock.calls[0][1];
    expect(payload.body).toContain('2');
    expect(payload.body).toContain('vencida');
    expect(payload.body).toContain('1');
    expect(payload.url).toBe('/contable/panel');
  });

  it('con una sola obligación, manda el detalle en vez del conteo', async () => {
    await notifyContableVencimientos('biz-1', [venc({ hito: 'hoy' })]);
    expect((sendPushToUsers as jest.Mock).mock.calls[0][1].body).toContain('IVA');
  });

  it('le llega al contador y a sus auxiliares', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'u-contador' }, { id: 'u-auxiliar' }]);
    await notifyContableVencimientos('biz-1', [venc()]);
    expect((sendPushToUsers as jest.Mock).mock.calls[0][0]).toEqual(['u-contador', 'u-auxiliar']);
  });
});

describe('las tres franjas del día dicen cosas distintas', () => {
  // Repetir el mismo texto tres veces es lo que hace que la gente apague las
  // notificaciones: cada franja tiene que aportar algo.
  const hoyMismo = venc({ id: 'v-hoy', hito: 'hoy' });
  const yaVencido = venc({ id: 'v-old', hito: 'vencido' });
  const mañana = { ...venc({ id: 'v-man', hito: 'cerca' }), dias: 1 };
  const enCinco = { ...venc({ id: 'v-5', hito: 'previo' }), dias: 5 };

  const cuerpoEnviado = () => (sendPushToUsers as jest.Mock).mock.calls[0]?.[1]?.body as string | undefined;

  it('mañana: da el panorama completo', async () => {
    await notifyContableVencimientos('biz-1', [yaVencido, hoyMismo, enCinco], 'panorama', 7);
    expect(cuerpoEnviado()).toMatch(/vencida|por vencer/);
  });

  it('mediodía: solo lo que se le acaba HOY', async () => {
    await notifyContableVencimientos('biz-1', [hoyMismo], 'pendientes', 14);
    expect(cuerpoEnviado()).toContain('HOY');
  });

  it('mediodía: NO suena si ya despachó lo urgente', async () => {
    // Solo quedan cosas que vencen en días: a mediodía eso no es noticia.
    await notifyContableVencimientos('biz-1', [enCinco], 'pendientes', 14);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it('cierre: prepara el día siguiente en vez de repetir lo de hoy', async () => {
    await notifyContableVencimientos('biz-1', [mañana], 'cierre', 18);
    expect(cuerpoEnviado()).toContain('Mañana');
  });

  it('cierre: si quedó algo de hoy sin presentar, también lo dice', async () => {
    await notifyContableVencimientos('biz-1', [mañana, hoyMismo], 'cierre', 18);
    expect(cuerpoEnviado()).toContain('Mañana');
    expect(cuerpoEnviado()).toContain('sin presentar');
  });

  it('cierre: NO suena si no hay nada de mañana ni pendiente de hoy', async () => {
    await notifyContableVencimientos('biz-1', [enCinco], 'cierre', 18);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it('cada franja suena una vez: la de la tarde no repite la de la mañana', async () => {
    // Ya se envió a las 7am de hoy.
    const hoy7am = new Date();
    hoy7am.setHours(7, 5, 0, 0);
    mockPrisma.business.findUnique.mockResolvedValue({ lastVencPushAt: hoy7am });

    // A las 7 otra vez (un reinicio del servidor): no debe sonar.
    await notifyContableVencimientos('biz-1', [hoyMismo], 'panorama', 7);
    expect(sendPushToUsers).not.toHaveBeenCalled();

    // A las 2pm sí, es otra franja.
    await notifyContableVencimientos('biz-1', [hoyMismo], 'pendientes', 14);
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
  });
});
