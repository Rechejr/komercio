import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import https from 'https';
import { prisma } from '../config/database';
import { AppError, success } from '../utils/response';
import { logger } from '../config/logger';
import { AuthRequest } from '../middlewares/auth';

const isTestMode = process.env.WOMPI_PRIVATE_KEY?.startsWith('prv_test_');
const WOMPI_BASE = isTestMode
  ? 'sandbox.wompi.co'
  : 'production.wompi.co';

// Precios "ancla" fijos en pesos redondos (no derivados de una fórmula) para que
// los totales queden limpios en Colombia: mensual $29.900, trimestral $80.700
// (equivale a $26.900/mes, −10%), anual $287.000 (−20% exacto sobre 358.800).
const PLAN_PRICES: Record<string, number> = {
  monthly:   29900,
  quarterly: 80700,
  annual:    287000,
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

      logger.info(`Wompi createLink: keyConfigured=${!!process.env.WOMPI_PRIVATE_KEY} testMode=${isTestMode} host=${WOMPI_BASE} period=${period}`);
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

      // Cada link queda en su propia fila (no se pisa con el siguiente): si el
      // usuario reintenta el checkout y genera un segundo link, el webhook del
      // primero (si llega tarde) todavía puede encontrar a qué negocio pertenece.
      await prisma.paymentLink.create({
        data: { id: linkData.id, businessId, period, months },
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
      const expectedHex = crypto.createHmac('sha256', eventsSecret).update(rawBody).digest('hex');
      const expected = `sha256=${expectedHex}`;
      // Comparación en tiempo constante — este endpoint otorga acceso pago, así que
      // no debe filtrar por temporización cuánto de la firma coincidió.
      const signatureValid = signature.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
      if (!signatureValid) {
        logger.warn('Wompi webhook: firma inválida');
        return res.status(401).json({ error: 'Firma inválida' });
      }

      const event = req.body as any;
      if (event?.event !== 'transaction.updated') return res.json({ received: true });

      const tx = event?.data?.transaction;
      if (!tx || tx.status !== 'APPROVED') return res.json({ received: true });

      const linkId = tx.payment_link_id as string | undefined;
      if (!linkId) return res.json({ received: true });

      const link = await prisma.paymentLink.findUnique({ where: { id: linkId } });
      if (!link) {
        logger.warn('Wompi webhook: link no encontrado', { linkId });
        return res.json({ received: true });
      }
      // Wompi puede reenviar el mismo evento más de una vez — sin este chequeo,
      // un webhook duplicado extendería el plan dos veces por el mismo pago.
      if (link.consumedAt) {
        logger.info('Wompi webhook: link ya procesado, ignorando duplicado', { linkId });
        return res.json({ received: true });
      }

      // Bloquea la fila del negocio dentro de una transacción interactiva — sin esto,
      // dos webhooks casi simultáneos (dos pagos del mismo negocio, o el mismo evento
      // reentregado por Wompi) podían leer el mismo planExpiresAt "base" antes de que
      // cualquiera confirmara, y el que escribiera último pisaba al otro: el negocio
      // quedaba acreditado con un solo pago, perdiendo el otro en silencio (sin error).
      const expiresAt = await prisma.$transaction(async (tx) => {
        const [lockedBiz] = await tx.$queryRawUnsafe<any[]>(
          `SELECT "planExpiresAt" FROM businesses WHERE id = $1 FOR UPDATE`,
          link.businessId,
        );
        if (!lockedBiz) return null;

        // Re-chequeo de consumedAt DENTRO del lock — el chequeo de arriba (antes de
        // abrir la transacción) no alcanza a evitar que dos entregas casi simultáneas
        // del MISMO webhook pasen ambas antes de que cualquiera marque consumedAt.
        const freshLink = await tx.paymentLink.findUnique({ where: { id: linkId } });
        if (!freshLink || freshLink.consumedAt) return null;

        // Si al negocio le quedaba tiempo vigente, se le suma desde ahí — no desde
        // "ahora" — para no regalarle un mes gratis por renovar antes de vencerse
        // (o, visto al revés, quitarle los días que ya tenía pagados).
        const currentExpiry = lockedBiz.planExpiresAt ? new Date(lockedBiz.planExpiresAt) : null;
        const base = currentExpiry && currentExpiry > new Date() ? currentExpiry : new Date();
        const newExpiresAt = new Date(base);
        newExpiresAt.setMonth(newExpiresAt.getMonth() + freshLink.months);

        await tx.business.update({
          where: { id: freshLink.businessId },
          data: { plan: 'pro', planExpiresAt: newExpiresAt },
        });
        await tx.paymentLink.update({
          where: { id: linkId },
          data: { consumedAt: new Date() },
        });
        return newExpiresAt;
      });

      if (expiresAt) {
        logger.info('Plan Pro activado', { businessId: link.businessId, period: link.period, expiresAt });
      }

      return res.json({ received: true });
    } catch (err: any) {
      logger.error(`Wompi webhook error: ${err?.message || err}`, { stack: err?.stack });
      next(err);
    }
  },
};