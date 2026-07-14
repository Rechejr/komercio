import { Response, NextFunction } from 'express';
import { Request } from 'express';
import { paymentController } from '../../controllers/payment.controller';
import { prisma } from '../../config/database';
import { AuthRequest } from '../../middlewares/auth';

// Wompi makes real HTTPS calls — mock the entire https module so tests are offline
jest.mock('https', () => ({
  request: jest.fn(),
}));

jest.mock('../../config/database', () => ({
  prisma: {
    business: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    paymentLink: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $queryRawUnsafe: jest.fn(),
    $transaction: jest.fn(),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
import * as https from 'https';
const mockHttpsRequest = https.request as jest.Mock;

function makeAuthReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'a@b.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'br-1' },
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as unknown as AuthRequest;
}

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json, status };
}

const next = jest.fn() as unknown as NextFunction;

function mockWompiHttps(responseBody: unknown, statusCode = 200) {
  mockHttpsRequest.mockImplementation((_options: any, callback: any) => {
    const mockRes: any = {
      statusCode,
      on: (event: string, handler: (...args: any[]) => void) => {
        if (event === 'data') handler(JSON.stringify(responseBody));
        if (event === 'end') handler();
        return mockRes;
      },
    };
    callback(mockRes);
    return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
  });
}

// ─── createLink ───────────────────────────────────────────────────────────────

describe('paymentController.createLink', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 cuando el período no es válido', async () => {
    await paymentController.createLink(
      makeAuthReq({ body: { period: 'weekly' } }),
      makeRes().res,
      next,
    );
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
  });

  it('crea el link de pago y su fila en payment_links', async () => {
    const linkId = 'link-abc123';
    mockWompiHttps({ data: { id: linkId } }, 200);
    (mockPrisma.paymentLink.create as jest.Mock).mockResolvedValue({});

    const { res, json } = makeRes();
    await paymentController.createLink(makeAuthReq({ body: { period: 'monthly' } }), res, next);

    expect(mockPrisma.paymentLink.create).toHaveBeenCalledWith({
      data: { id: linkId, businessId: 'biz-1', period: 'monthly', months: 1 },
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ data: { url: `https://checkout.wompi.co/l/${linkId}` } })
    );
  });

  it('llama next con 502 cuando Wompi devuelve error HTTP', async () => {
    mockWompiHttps({ error: 'unauthorized' }, 401);

    await paymentController.createLink(makeAuthReq({ body: { period: 'annual' } }), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(502);
  });
});

// ─── webhook ─────────────────────────────────────────────────────────────────

describe('paymentController.webhook', () => {
  const EVENTS_SECRET = 'test-events-secret-123';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WOMPI_EVENTS_SECRET = EVENTS_SECRET;
    // La transacción ahora es interactiva (bloquea la fila del negocio antes de
    // leer planExpiresAt) — se reutiliza mockPrisma como "tx" ya que expone los
    // mismos métodos (business.update, paymentLink.findUnique/update) que se
    // configuran por test más abajo.
    (mockPrisma.$transaction as jest.Mock).mockImplementation((fn: any) => fn(mockPrisma));
  });

  afterAll(() => {
    delete process.env.WOMPI_EVENTS_SECRET;
  });

  function makeWebhookReq(overrides: Partial<Request> = {}): Request {
    return {
      headers: {},
      body: {},
      rawBody: '',
      ...overrides,
    } as unknown as Request;
  }

  function signedBody(txBody: any) {
    const crypto = require('crypto');
    const rawBody = JSON.stringify(txBody);
    const sig = `sha256=${crypto.createHmac('sha256', EVENTS_SECRET).update(rawBody).digest('hex')}`;
    return { rawBody, sig };
  }

  it('retorna 401 cuando falta la firma x-event-signature', async () => {
    const { res, status } = makeRes();
    await paymentController.webhook(makeWebhookReq(), res, next);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('retorna 401 cuando la firma es inválida', async () => {
    const { res, status } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': 'sha256=invalid' }, rawBody: '{}' } as any),
      res,
      next,
    );
    expect(status).toHaveBeenCalledWith(401);
  });

  it('responde con received:true sin procesar si el evento no es transaction.updated', async () => {
    const txBody = { event: 'other.event' };
    const { rawBody, sig } = signedBody(txBody);

    const { res, json } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: txBody, rawBody } as any),
      res,
      next,
    );
    expect(json).toHaveBeenCalledWith({ received: true });
    expect(mockPrisma.business.update).not.toHaveBeenCalled();
  });

  it('responde received:true sin activar nada si el link no existe', async () => {
    const linkId = 'link-unknown';
    const txBody = { event: 'transaction.updated', data: { transaction: { status: 'APPROVED', payment_link_id: linkId } } };
    const { rawBody, sig } = signedBody(txBody);

    (mockPrisma.paymentLink.findUnique as jest.Mock).mockResolvedValue(null);

    const { res, json } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: txBody, rawBody } as any),
      res,
      next,
    );

    expect(mockPrisma.business.update).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ received: true });
  });

  it('activa el plan Pro y marca el link como consumido cuando llega una transacción APPROVED', async () => {
    const linkId = 'link-xyz';
    const txBody = { event: 'transaction.updated', data: { transaction: { status: 'APPROVED', payment_link_id: linkId } } };
    const { rawBody, sig } = signedBody(txBody);

    (mockPrisma.paymentLink.findUnique as jest.Mock).mockResolvedValue({
      id: linkId, businessId: 'biz-1', period: 'monthly', months: 1, consumedAt: null,
    });
    (mockPrisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ planExpiresAt: null }]);

    const { res, json } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: txBody, rawBody } as any),
      res,
      next,
    );

    expect(mockPrisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'biz-1' }, data: expect.objectContaining({ plan: 'pro' }) })
    );
    expect(mockPrisma.paymentLink.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: linkId }, data: expect.objectContaining({ consumedAt: expect.any(Date) }) })
    );
    expect(json).toHaveBeenCalledWith({ received: true });
  });

  it('ignora un webhook duplicado si el link ya fue consumido antes', async () => {
    const linkId = 'link-already-done';
    const txBody = { event: 'transaction.updated', data: { transaction: { status: 'APPROVED', payment_link_id: linkId } } };
    const { rawBody, sig } = signedBody(txBody);

    (mockPrisma.paymentLink.findUnique as jest.Mock).mockResolvedValue({
      id: linkId, businessId: 'biz-1', period: 'monthly', months: 1, consumedAt: new Date(),
    });

    const { res, json } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: txBody, rawBody } as any),
      res,
      next,
    );

    expect(mockPrisma.business.update).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ received: true });
  });

  it('al renovar con tiempo vigente, extiende desde el vencimiento actual en vez de resetear desde hoy', async () => {
    const linkId = 'link-renewal';
    const txBody = { event: 'transaction.updated', data: { transaction: { status: 'APPROVED', payment_link_id: linkId } } };
    const { rawBody, sig } = signedBody(txBody);

    const futureExpiry = new Date();
    futureExpiry.setDate(futureExpiry.getDate() + 20); // 20 días vigentes todavía

    (mockPrisma.paymentLink.findUnique as jest.Mock).mockResolvedValue({
      id: linkId, businessId: 'biz-1', period: 'monthly', months: 1, consumedAt: null,
    });
    (mockPrisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ planExpiresAt: futureExpiry }]);

    const { res } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: txBody, rawBody } as any),
      res,
      next,
    );

    const updateCall = (mockPrisma.business.update as jest.Mock).mock.calls[0][0];
    const newExpiry: Date = updateCall.data.planExpiresAt;
    // Debe quedar ~1 mes después del vencimiento futuro (no ~1 mes después de hoy)
    const expectedFloor = new Date(futureExpiry);
    expectedFloor.setDate(expectedFloor.getDate() + 25); // al menos 25 días de margen (1 mes - unos días)
    expect(newExpiry.getTime()).toBeGreaterThan(expectedFloor.getTime());
  });

  it('bloquea la fila del negocio con FOR UPDATE antes de leer planExpiresAt (evita el lost-update entre webhooks concurrentes)', async () => {
    const linkId = 'link-lock-test';
    const txBody = { event: 'transaction.updated', data: { transaction: { status: 'APPROVED', payment_link_id: linkId } } };
    const { rawBody, sig } = signedBody(txBody);

    (mockPrisma.paymentLink.findUnique as jest.Mock).mockResolvedValue({
      id: linkId, businessId: 'biz-1', period: 'monthly', months: 1, consumedAt: null,
    });
    (mockPrisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ planExpiresAt: null }]);

    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: txBody, rawBody } as any),
      makeRes().res,
      next,
    );

    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE'),
      'biz-1',
    );
  });

  it('no activa el plan si otro webhook concurrente ya consumió el link dentro del lock (re-chequeo tras el FOR UPDATE)', async () => {
    const linkId = 'link-race';
    const txBody = { event: 'transaction.updated', data: { transaction: { status: 'APPROVED', payment_link_id: linkId } } };
    const { rawBody, sig } = signedBody(txBody);

    // El chequeo de fuera de la transacción ve consumedAt: null (llegó primero),
    // pero para cuando entra al lock, otro webhook ya lo marcó consumido.
    (mockPrisma.paymentLink.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: linkId, businessId: 'biz-1', period: 'monthly', months: 1, consumedAt: null })
      .mockResolvedValueOnce({ id: linkId, businessId: 'biz-1', period: 'monthly', months: 1, consumedAt: new Date() });
    (mockPrisma.$queryRawUnsafe as jest.Mock).mockResolvedValue([{ planExpiresAt: null }]);

    const { res, json } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: txBody, rawBody } as any),
      res,
      next,
    );

    expect(mockPrisma.business.update).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith({ received: true });
  });
});
