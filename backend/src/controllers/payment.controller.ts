import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import https from 'https';
import { prisma } from '../config/database';
import { AppError, success } from '../utils/response';
import { logger } from '../config/logger';
import { AuthRequest } from '../middlewares/auth';
import bcrypt from 'bcryptjs';
import { createBusinessForOwner } from './auth.controller';
import { generarPasswordTemporal } from '../utils/tempPassword';
import { emailService } from '../config/email';

// .trim() defensivo: al pegar las llaves en el panel de hosting es fácil arrastrar
// un espacio o salto de línea, y un '\n' en el valor rompe el header Authorization
// (ERR_INVALID_CHAR) o desalinea el secreto de firma. Se limpia una sola vez aquí.
const WOMPI_PRIVATE_KEY = (process.env.WOMPI_PRIVATE_KEY || '').trim();
const isTestMode = WOMPI_PRIVATE_KEY.startsWith('prv_test_');
const WOMPI_BASE = isTestMode
  ? 'sandbox.wompi.co'
  : 'production.wompi.co';

// Precios "ancla" fijos en pesos redondos (no derivados de una fórmula) para que
// los totales queden limpios en Colombia: mensual $29.900, trimestral $80.700
// (equivale a $26.900/mes, −10%), anual $287.000 (−20% exacto sobre 358.800).
export const PLAN_PRICES: Record<string, number> = {
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

// Ventrix Contable: plan anual por oficina (contador + hasta 3 auxiliares).
// Debe coincidir con PRECIO_ANUAL del landing (frontend app/contable/page.tsx).
export const CONTABLE_ANNUAL_PRICE = 120000;
const CONTABLE_ANNUAL_MONTHS = 12;

function wompiPost(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options: https.RequestOptions = {
      hostname: WOMPI_BASE,
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}`,
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

// Consulta una transacción de Wompi por id (para verificar un pago antes de
// provisionar una cuenta desde el portal de vendedoras). Usa la misma base/llave.
export function getWompiTransaction(id: string): Promise<{ ok: boolean; status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: WOMPI_BASE,
      path: `/v1/transactions/${encodeURIComponent(id)}`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${WOMPI_PRIVATE_KEY}` },
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
    req.end();
  });
}

export const WOMPI_CONFIGURED = WOMPI_PRIVATE_KEY.length > 0;

// Resuelve una ruta "a.b.c" dentro de un objeto (para las signature.properties
// de Wompi, que son rutas relativas al objeto `data` del evento).
function resolvePath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

// Calcula el checksum de un evento de Wompi según su esquema oficial:
//   SHA256( <valores de signature.properties, en orden> + timestamp + EVENTS_SECRET )
// en hex MAYÚSCULAS. Las properties son rutas relativas a `event.data`
// (p.ej. "transaction.id" -> event.data.transaction.id). NO es un HMAC del cuerpo.
// Devuelve null si el evento no trae la estructura firmable esperada.
// Ref: https://docs.wompi.co/docs/colombia/eventos/
export function wompiEventChecksum(event: any, secret: string): string | null {
  const props: unknown = event?.signature?.properties;
  const timestamp = event?.timestamp;
  if (!Array.isArray(props) || props.length === 0 || timestamp == null || !event?.data) {
    return null;
  }
  let concatenated = '';
  for (const p of props) {
    const val = resolvePath(event.data, String(p));
    if (val == null) return null; // una propiedad firmada ausente -> no se puede validar
    concatenated += String(val);
  }
  concatenated += String(timestamp) + secret;
  return crypto.createHash('sha256').update(concatenated).digest('hex').toUpperCase();
}

export const paymentController = {
  async createLink(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { period = 'monthly' } = req.body;
      const businessId = req.user!.businessId;
      if (!businessId) throw new AppError('No tienes un negocio registrado', 400);

      // El producto define el precio. Una cuenta contable tiene un único plan
      // (anual $120.000); una cuenta POS elige mensual/trimestral/anual.
      const business = await prisma.business.findUnique({
        where: { id: businessId },
        select: { type: true },
      });
      const esContable = business?.type === 'contable';

      logger.info(`Wompi createLink: type=${business?.type} testMode=${isTestMode} host=${WOMPI_BASE} period=${period}`);

      let amountCOP: number;
      let months: number;
      let planName: string;
      let planDesc: string;
      let storedPeriod: string;

      if (esContable) {
        amountCOP = CONTABLE_ANNUAL_PRICE;
        months = CONTABLE_ANNUAL_MONTHS;
        storedPeriod = 'annual';
        planName = 'Ventrix Contable — Plan anual';
        planDesc = 'Agenda tributaria por 12 meses';
      } else {
        if (!['monthly', 'quarterly', 'annual'].includes(period)) {
          throw new AppError('Período no válido', 400);
        }
        amountCOP = PLAN_PRICES[period];
        months = PLAN_MONTHS[period];
        storedPeriod = period;
        planName = `Plan Pro Ventrix — ${PERIOD_LABELS[period]}`;
        planDesc = `Ventrix ilimitado por ${months} mes${months > 1 ? 'es' : ''}`;
      }

      const frontendUrl = (process.env.FRONTEND_URL || 'https://ventrix.lat').trim().replace(/\/+$/, '');
      const redirectUrl = `${frontendUrl}/payment-result`;
      logger.info(`Wompi redirect_url: ${redirectUrl}`);

      const wompiRes = await wompiPost('/v1/payment_links', {
        name: planName,
        description: planDesc,
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
        data: { id: linkData.id, businessId, period: storedPeriod, months },
      });

      return success(res, { url: paymentUrl });
    } catch (err) {
      next(err);
    }
  },


  // POST /payments/checkout — PÚBLICO. El prospecto elige plan en /planes, deja
  // cuatro datos y se va derecho a pagar. No hay cuenta todavía: por eso el pago
  // se guarda en guest_checkouts y no en payment_links (que cuelga de un negocio).
  // Cuando Wompi confirma, el webhook crea la cuenta y manda las credenciales.
  async checkoutInvitado(req: Request, res: Response, next: NextFunction) {
    try {
      const productType = req.body.productType === 'contable' ? 'contable' : 'pos';
      const period: string = productType === 'contable' ? 'annual' : (req.body.period || 'monthly');
      const nombre = String(req.body.name || '').trim();
      const apellidos = String(req.body.lastName || '').trim();
      const documento = String(req.body.document || '').replace(/\D/g, '');
      const email = String(req.body.email || '').trim().toLowerCase();
      const sellerSlug = req.body.sellerSlug ? String(req.body.sellerSlug).trim().toLowerCase().slice(0, 40) : null;

      if (!WOMPI_CONFIGURED) throw new AppError('Los pagos no están habilitados en este momento.', 503);
      if (!nombre || !apellidos) throw new AppError('Escribe tu nombre y tus apellidos', 400);
      if (documento.length < 5) throw new AppError('Escribe tu número de cédula', 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError('Escribe un correo válido', 400);

      // Si ya tiene cuenta, el pago no debe hacerse por aquí: adentro de la app
      // el pago SÍ se empareja con su negocio y le extiende el plan.
      const existe = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (existe) {
        throw new AppError('Ese correo ya tiene una cuenta en Ventrix. Inicia sesión y activa tu plan desde adentro.', 409);
      }

      const esContable = productType === 'contable';
      if (!esContable && !['monthly', 'quarterly', 'annual'].includes(period)) {
        throw new AppError('Período no válido', 400);
      }
      const amountCOP = esContable ? CONTABLE_ANNUAL_PRICE : PLAN_PRICES[period];
      const months = esContable ? CONTABLE_ANNUAL_MONTHS : PLAN_MONTHS[period];
      const planName = esContable
        ? 'Ventrix Contable — Plan anual'
        : `Plan Pro Ventrix — ${PERIOD_LABELS[period]}`;

      const frontendUrl = (process.env.FRONTEND_URL || 'https://ventrix.lat').trim().replace(/\/+$/, '');
      const wompiRes = await wompiPost('/v1/payment_links', {
        name: planName,
        description: `${esContable ? 'Agenda tributaria' : 'Ventrix ilimitado'} por ${months} mes${months > 1 ? 'es' : ''}`,
        single_use: true,
        collect_shipping: false,
        currency: 'COP',
        amount_in_cents: amountCOP * 100,
        redirect_url: `${frontendUrl}/payment-result?nuevo=1`,
      });
      if (!wompiRes.ok) {
        logger.error(`Wompi checkoutInvitado HTTP ${wompiRes.status}: ${JSON.stringify(wompiRes.data)}`);
        throw new AppError('No se pudo abrir el pago. Intenta de nuevo en un momento.', 502);
      }

      const linkId = (wompiRes.data?.data as { id: string }).id;
      await prisma.guestCheckout.create({
        data: {
          paymentLinkId: linkId,
          productType, period: esContable ? 'annual' : period, months, amount: amountCOP,
          buyerName: nombre.slice(0, 80), buyerLastName: apellidos.slice(0, 80),
          buyerDoc: documento.slice(0, 20), buyerEmail: email, sellerSlug,
        },
      });

      logger.info(`Compra sin cuenta iniciada: ${email} · ${productType}/${period}${sellerSlug ? ` · vendedora ${sellerSlug}` : ''}`);
      return success(res, { url: `https://checkout.wompi.co/l/${linkId}` });
    } catch (err) {
      next(err);
    }
  },

  async webhook(req: Request, res: Response, next: NextFunction) {
    try {
      const eventsSecret = (process.env.WOMPI_EVENTS_SECRET || '').trim();
      if (!eventsSecret) {
        logger.error('WOMPI_EVENTS_SECRET no configurado — rechazando webhook');
        return res.status(500).json({ error: 'Webhook no configurado' });
      }

      const event = req.body as any;

      // Wompi firma el evento con un checksum SHA256 (NO un HMAC del cuerpo) que
      // llega en el body como signature.checksum (y también en el header
      // X-Event-Checksum). Se recalcula a partir de signature.properties + timestamp
      // + el secreto de eventos y se compara en tiempo constante.
      const provided = event?.signature?.checksum as string | undefined;
      if (!provided) {
        logger.warn('Wompi webhook: falta signature.checksum');
        return res.status(401).json({ error: 'Firma requerida' });
      }
      const expected = wompiEventChecksum(event, eventsSecret);
      if (!expected) {
        logger.warn('Wompi webhook: no se pudo calcular la firma (estructura inesperada)');
        return res.status(401).json({ error: 'Firma inválida' });
      }
      // Comparación en tiempo constante (Wompi entrega el hex en mayúsculas; se
      // normaliza por si acaso). Este endpoint otorga acceso pago, así que no debe
      // filtrar por temporización cuánto de la firma coincidió.
      const providedBuf = Buffer.from(provided.toUpperCase());
      const expectedBuf = Buffer.from(expected);
      const signatureValid = providedBuf.length === expectedBuf.length &&
        crypto.timingSafeEqual(providedBuf, expectedBuf);
      if (!signatureValid) {
        logger.warn('Wompi webhook: firma inválida');
        return res.status(401).json({ error: 'Firma inválida' });
      }
      if (event?.event !== 'transaction.updated') return res.json({ received: true });

      const tx = event?.data?.transaction;
      if (!tx || tx.status !== 'APPROVED') return res.json({ received: true });

      const linkId = tx.payment_link_id as string | undefined;
      if (!linkId) return res.json({ received: true });

      // ── Compra sin cuenta ────────────────────────────────────────────────────
      // El pago se hizo antes de que existiera el usuario: aquí se le crea la
      // cuenta y se le mandan las credenciales por correo. Va antes que el flujo
      // normal porque estos links no tienen fila en payment_links.
      const guest = await prisma.guestCheckout.findUnique({ where: { paymentLinkId: linkId } });
      if (guest) {
        if (guest.status === 'provisioned') {
          logger.info('Wompi webhook: compra sin cuenta ya atendida, ignorando duplicado', { linkId });
          return res.json({ received: true });
        }
        await provisionarCompraInvitado(guest, tx);
        return res.json({ received: true });
      }

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

// Crea el usuario + negocio de una compra sin cuenta y le envía las credenciales.
// Se llama desde el webhook, así que el pago ya está APROBADO y firmado por Wompi;
// aun así se verifica el MONTO, para que un link manipulado no active un plan caro
// con un pago barato. Es idempotente: la fila queda en "provisioned" y un webhook
// repetido no crea una segunda cuenta.
export async function provisionarCompraInvitado(
  guest: { id: string; buyerName: string; buyerLastName: string; buyerEmail: string; productType: string; months: number; amount: number; sellerSlug: string | null },
  tx: { id?: string; amount_in_cents?: number },
) {
  const pagado = Math.round((tx.amount_in_cents || 0) / 100);
  if (pagado !== guest.amount) {
    const msg = `Monto pagado (${pagado}) distinto al del plan (${guest.amount})`;
    logger.error(`Compra sin cuenta: ${msg}`, { guestId: guest.id });
    await prisma.guestCheckout.update({ where: { id: guest.id }, data: { status: 'failed', errorMessage: msg, transactionId: tx.id || null } });
    return;
  }

  // Entre el pago y el webhook alguien pudo registrarse con ese correo.
  const yaExiste = await prisma.user.findUnique({ where: { email: guest.buyerEmail }, select: { id: true } });
  if (yaExiste) {
    const msg = 'Ese correo ya tenía cuenta cuando llegó el pago — revisar y aplicar el plan a mano';
    logger.error(`Compra sin cuenta: ${msg}`, { guestId: guest.id, email: guest.buyerEmail });
    await prisma.guestCheckout.update({ where: { id: guest.id }, data: { status: 'failed', errorMessage: msg, transactionId: tx.id || null } });
    return;
  }

  const nombreCompleto = `${guest.buyerName} ${guest.buyerLastName}`.trim();
  const esContable = guest.productType === 'contable';
  const nombreNegocio = esContable ? `Contabilidad de ${guest.buyerName}` : `Negocio de ${guest.buyerName}`;
  const planExpiresAt = new Date(Date.now() + guest.months * 30 * 24 * 60 * 60 * 1000);
  const plainPassword = generarPasswordTemporal();
  const hashed = await bcrypt.hash(plainPassword, 12);

  // La vendedora que compartió el link se lleva la venta en su portal.
  const seller = guest.sellerSlug
    ? await prisma.seller.findFirst({ where: { slug: guest.sellerSlug }, select: { id: true } })
    : null;

  try {
    const business = await prisma.$transaction(async (dbtx) => {
      const user = await dbtx.user.create({
        // Verificada: el pago ya confirma que el correo es suyo, y pedirle
        // verificar antes de entrar sería una fricción de más tras haber pagado.
        data: { name: nombreCompleto, email: guest.buyerEmail, password: hashed, role: 'ADMIN', isEmailVerified: true },
      });
      const biz = await createBusinessForOwner(dbtx, {
        userId: user.id, businessName: nombreNegocio, businessType: guest.productType, assignBranch: true,
      });
      await dbtx.business.update({
        where: { id: biz.id },
        data: { plan: 'pro', planExpiresAt, paymentRef: tx.id || null, ...(seller ? { createdBySellerId: seller.id } : {}) },
      });
      return biz;
    });

    await prisma.guestCheckout.update({
      where: { id: guest.id },
      data: { status: 'provisioned', transactionId: tx.id || null, businessId: business.id, provisionedAt: new Date() },
    });

    await emailService.sendCredenciales(guest.buyerEmail, guest.buyerName, plainPassword, guest.productType);
    logger.info(`Compra sin cuenta atendida: cuenta creada para ${guest.buyerEmail} (${guest.productType})`, { businessId: business.id });
  } catch (err: any) {
    // El pago ya entró: si la cuenta falla, queda registrado para atenderlo a mano
    // en vez de perderse en un log.
    logger.error(`Compra sin cuenta: no se pudo crear la cuenta de ${guest.buyerEmail}: ${err?.message || err}`);
    await prisma.guestCheckout.update({
      where: { id: guest.id },
      data: { status: 'failed', errorMessage: String(err?.message || err).slice(0, 400), transactionId: tx.id || null },
    });
  }
}
