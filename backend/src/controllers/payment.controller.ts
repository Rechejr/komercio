import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success } from '../utils/response';
import { logger } from '../config/logger';
import { AuthRequest } from '../middlewares/auth';

const isTestMode = process.env.WOMPI_PRIVATE_KEY?.startsWith('prv_test_');
const WOMPI_BASE = isTestMode
  ? 'https://sandbox.wompi.co/v1'
  : 'https://production.wompi.co/v1';

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

function cop(n: number) {
  return `$${n.toLocaleString('es-CO')}`;
}

export const paymentController = {
  async createLink(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { period = 'monthly' } = req.body;
      const businessId = req.user!.businessId;

      if (!businessId) throw new AppError('No tienes un negocio registrado', 400);
      if (!['monthly', 'quarterly', 'annual'].includes(period)) {
        throw new AppError('Período no válido', 400);
      }

      const amountCOP = PLAN_PRICES[period];
      const months    = PLAN_MONTHS[period];
      const label     = PERIOD_LABELS[period];
      const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://ventrix.lat';
      const redirectUrl = `${frontendUrl}/payment-result`;

      const wompiRes = await fetch(`${WOMPI_BASE}/payment_links`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WOMPI_PRIVATE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: `Plan Pro Ventrix — ${label}`,
          description: `Ventrix ilimitado por ${months} mes${months > 1 ? 'es' : ''} (${cop(amountCOP)}/mes)`,
          single_use: true,
          collect_shipping: false,
          currency: 'COP',
          amount_in_cents: amountCOP * 100,
          redirect_url: redirectUrl,
        }),
      });

      if (!wompiRes.ok) {
        const errText = await wompiRes.text();
        logger.error('Wompi createLink error', { status: wompiRes.status, body: errText });
        throw new AppError('Error al crear el enlace de pago', 502);
      }

      const { data: linkData } = await wompiRes.json() as { data: { id: string; url: string } };

      // Primary: Redis (TTL 2h)
      await cache.set(`wompi_link:${linkData.id}`, { businessId, period, months }, 7200);

      // Fallback: store in Business.settings
      const biz = await prisma.business.findUnique({ where: { id: businessId }, select: { settings: true } });
      const currentSettings = (biz?.settings as Record<string, unknown>) || {};
      await prisma.business.update({
        where: { id: businessId },
        data: { settings: { ...currentSettings, pendingPayment: { linkId: linkData.id, period, months } } },
      });

      return success(res, { url: linkData.url });
    } catch (err) {
      next(err);
    }
  },

  async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      // Verify Wompi signature
      const signature   = req.headers['x-event-signature'] as string | undefined;
      const eventsSecret = process.env.WOMPI_EVENTS_SECRET || '';

      if (signature && eventsSecret) {
        const rawBody = (req as any).rawBody as string || '';
        const expected = `sha256=${crypto.createHmac('sha256', eventsSecret).update(rawBody).digest('hex')}`;
        if (signature !== expected) {
          logger.warn('Wompi webhook: firma inválida');
          return res.status(401).json({ error: 'Firma inválida' });
        }
      }

      const event = req.body as any;
      if (event?.event !== 'transaction.updated') return res.json({ received: true });

      const tx = event?.data?.transaction;
      if (!tx || tx.status !== 'APPROVED') return res.json({ received: true });

      const linkId = tx.payment_link_id as string | undefined;
      if (!linkId) return res.json({ received: true });

      // Resolve businessId — Redis first, DB fallback
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

      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setMonth(expiresAt.getMonth() + meta.months);

      // Activate plan
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