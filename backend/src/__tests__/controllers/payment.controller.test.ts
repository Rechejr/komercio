import { Response, NextFunction } from 'express';
import { Request } from 'express';
import { paymentController } from '../../controllers/payment.controller';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { AuthRequest } from '../../middlewares/auth';

// Wompi makes real HTTPS calls — mock the entire https module so tests are offline
jest.mock('https', () => ({
  request: jest.fn(),
}));

jest.mock('../../config/database', () => ({
  prisma: {
    business: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../config/redis', () => ({
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../config/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockCache = cache as jest.Mocked<typeof cache>;
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

  it('crea el link de pago y lo guarda en Redis y en BD', async () => {
    const linkId = 'link-abc123';
    mockWompiHttps({ data: { id: linkId } }, 200);
    mockCache.set.mockResolvedValue('OK' as any);
    (mockPrisma.business.findUnique as jest.Mock).mockResolvedValue({ settings: {} });
    (mockPrisma.business.update as jest.Mock).mockResolvedValue({});

    const { res, json } = makeRes();
    await paymentController.createLink(makeAuthReq({ body: { period: 'monthly' } }), res, next);

    expect(mockCache.set).toHaveBeenCalledWith(
      `wompi_link:${linkId}`,
      { businessId: 'biz-1', period: 'monthly', months: 1 },
      7200,
    );
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

  it('retorna 401 cuando falta la firma x-event-signature', async () => {
    const { res, status, json } = makeRes();
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
    const import_crypto = require('crypto');
    const rawBody = JSON.stringify({ event: 'other.event' });
    const sig = `sha256=${import_crypto.createHmac('sha256', EVENTS_SECRET).update(rawBody).digest('hex')}`;

    const { res, json } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: { event: 'other.event' }, rawBody } as any),
      res,
      next,
    );
    expect(json).toHaveBeenCalledWith({ received: true });
    expect(mockPrisma.business.update).not.toHaveBeenCalled();
  });

  it('activa el plan Pro cuando llega una transacción APPROVED con link válido en Redis', async () => {
    const crypto = require('crypto');
    const linkId = 'link-xyz';
    const meta = { businessId: 'biz-1', period: 'monthly', months: 1 };
    const txBody = { event: 'transaction.updated', data: { transaction: { status: 'APPROVED', payment_link_id: linkId } } };
    const rawBody = JSON.stringify(txBody);
    const sig = `sha256=${crypto.createHmac('sha256', EVENTS_SECRET).update(rawBody).digest('hex')}`;

    mockCache.get.mockResolvedValue(meta as any);
    mockCache.del.mockResolvedValue(1 as any);
    (mockPrisma.business.findUnique as jest.Mock).mockResolvedValue({ settings: { some: 'data' } });
    (mockPrisma.business.update as jest.Mock).mockResolvedValue({});

    const { res, json } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: txBody, rawBody } as any),
      res,
      next,
    );

    expect(mockPrisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plan: 'pro' }) })
    );
    expect(mockCache.del).toHaveBeenCalledWith(`wompi_link:${linkId}`);
    expect(json).toHaveBeenCalledWith({ received: true });
  });

  it('activa el plan Pro usando el fallback de BD cuando Redis no tiene el link', async () => {
    const crypto = require('crypto');
    const linkId = 'link-fallback';
    const txBody = { event: 'transaction.updated', data: { transaction: { status: 'APPROVED', payment_link_id: linkId } } };
    const rawBody = JSON.stringify(txBody);
    const sig = `sha256=${crypto.createHmac('sha256', EVENTS_SECRET).update(rawBody).digest('hex')}`;

    mockCache.get.mockResolvedValue(null);
    mockCache.del.mockResolvedValue(1 as any);
    (mockPrisma.business.findFirst as jest.Mock).mockResolvedValue({
      id: 'biz-1',
      settings: { pendingPayment: { linkId, period: 'quarterly', months: 3 } },
    });
    (mockPrisma.business.findUnique as jest.Mock).mockResolvedValue({
      settings: { pendingPayment: { linkId, period: 'quarterly', months: 3 } },
    });
    (mockPrisma.business.update as jest.Mock).mockResolvedValue({});

    const { res, json } = makeRes();
    await paymentController.webhook(
      makeWebhookReq({ headers: { 'x-event-signature': sig }, body: txBody, rawBody } as any),
      res,
      next,
    );

    expect(mockPrisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ plan: 'pro' }) })
    );
    expect(json).toHaveBeenCalledWith({ received: true });
  });
});