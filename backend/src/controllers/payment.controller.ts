import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import https from 'https';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success } from '../utils/response';
import { logger } from '../config/logger';
import { AuthRequest } from '../middlewares/auth';

const isTestMode = process.env.WOMPI_PRIVATE_KEY?.startsWith('prv_test_');
const WOMPI_BASE = isTestMode
  ? 'sandbox.wompi.co'
  : 'production.wompi.co';

const PLAN_PRICES: Record<string, number> = {
  monthly:   19900,
  quarterly: Math.round(19900 * 3 * 0.9),
  annual:    Math.round(19900 * 12 * 0.75),
};

const PLAN_MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

const PERIOD_LABELS: Record<string, string> = {
  monthly:   'Mensual',
  quarterly: 'Trimestral',
  annual:    'Anual',
};

function wompiPost(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options: https.RequestOptions = {
      hostname: WOMPI_BASE,
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WOMPI_PRIVATE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300, status: res.statusCode ?? 0, data: JSON.parse(raw) });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export const paymentController = {
  async createLink(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { period = 'monthly' } = req.body;
      const businessId = req.user!.businessId;

      logger.info(`Wompi createLink: key=${process.env.WOMPI_PRIVATE_KEY?.slice(0, 12)}... host=${WOMPI_BASE} period=${period}`);
      if (!businessId) throw new AppError('No tienes un negocio registrado', 400);
      if (!['monthly', 'quarterly', 'annual'].includes(period)) {
        throw new AppError('Período no válido', 400);
      }

      const amountCOP = PLAN_PRICES[period];
      const months    = PLAN_MONTHS[period];
      const label     = PERIOD_LABELS[period];
      const frontendUrl = (process.env.FRONTEND_URL || 'https://ventrix.lat').trim().replace(/\/+$/, '');
      const redirectUrl = `${frontendUrl}/payment-result`;
      logger.info(`Wompi redirect_url: ${redirectUrl}`);

      const wompiRes = await wompiPost('/v1/payment_links', {
        name: `Plan Pro Ventrix — ${label}`,
        description: `Ventrix ilimitado por ${months} mes${months > 1 ? 'es' : ''}`,
        single_use: true,
        collect_shipping: false,
        currency: 'COP',
        amount_in_cents: amountCOP * 100,
        redirect_url: redirectUrl,
      });

      if (!wompiRes.ok) {
        logger.error(`Wompi createLink HTTP ${wompiRes.status}: ${JSON.stringify(wompiRes.data)}`);
        throw new AppError('Error al crear el enlace de pago', 502);
      }

      const linkData = wompiRes.data?.data as { id: string };
      // Wompi no devuelve campo "url" — la URL de checkout se construye con el id
      const paymentUrl = `https://checkout.wompi.co/l/${linkData.id}`;

      // Primary: Redis (TTL 2h)
      await cache.set(`wompi_link:${linkData.id}`, { businessId, period, months }, 7200);

      // Fallback: Business.settings
      const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { settings: true } });
      const currentSettings = (biz?.settings as Record<string, any>) || {};
      await prisma.business.update({
        where: { id: businessId },
        data: { settings: { ...currentSettings, pendingPayment: { linkId: linkData.id, period, months } } },
      });

      return success(res, { url: paymentUrl });
    } catch (err) {
      next(err);
    }
  },

  async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const signature    = req.headers['x-event-signature'] as string | undefined;
      const eventsSecret = process.env.WOMPI_EVENTS_SECRET;

      if (!eventsSecret) {
        logger.error('WOMPI_EVENTS_SECRET no configurado — rechazando webhook');
        return res.status(500).json({ error: 'Webhook no configurado' });
      }
      if (!signature) {
        logger.warn('Wompi webhook: cabecera x-event-signature ausente');
        return res.status(401).json({ error: 'Firma requerida' });
      }
      const rawBody = (req as any).rawBody as string || '';
      const expected = `sha256=${crypto.createHmac('sha256', eventsSecret).update(rawBody).digest('hex')}`;
      if (signature !== expected) {
        logger.warn('Wompi webhook: firma inválida');
        return res.status(401).json({ error: 'Firma inválida' });
      }

      const event = req.body as any;
      if (event?.event !== 'transaction.updated') return res.json({ received: true });

      const tx = event?.data?.transaction;
      if (!tx || tx.status !== 'APPROVED') return res.json({ received: true });

      const linkId = tx.payment_link_id as string | undefined;
      if (!linkId) return res.json({ received: true });

      let meta = await cache.get<{ businessId: string; period: string; months: number }>(`wompi_link:${linkId}`);

      if (!meta) {
        const biz = await prisma.business.findFirst({
          where: { settings: { path: ['pendingPayment', 'linkId'], equals: linkId } },
          select: { id: true, settings: true },
        });
        if (biz) {
          const pmt = (biz.settings as any)?.pendingPayment;
          meta = { businessId: biz.id, period: pmt.period, months: pmt.months };
        }
      }

      if (!meta) {
        logger.warn('Wompi webhook: link no encontrado', { linkId });
        return res.json({ received: true });
      }

      const expiresAt = new Date();
      expiresAt.setMonth(expiresAt.getMonth() + meta.months);

      const bizNow = await prisma.business.findUnique({ where: { id: meta.businessId }, select: { settings: true } });
      const { pendingPayment: _removed, ...cleanSettings } = ((bizNow?.settings as Record<string, any>) || {});
      await prisma.business.update({
        where: { id: meta.businessId },
        data: { plan: 'pro', planExpiresAt: expiresAt, settings: cleanSettings },
      });

      await cache.del(`wompi_link:${linkId}`);
      logger.info('Plan Pro activado', { businessId: meta.businessId, period: meta.period, expiresAt });

      return res.json({ received: true });
    } catch (err) {
      logger.error('Wompi webhook error', err);
      next(err);
    }
  },
};