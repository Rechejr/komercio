import { Request, Response, NextFunction } from 'express';
import { paymentController, provisionarCompraInvitado } from '../../controllers/payment.controller';
import { prisma } from '../../config/database';
import { emailService } from '../../config/email';

// Compra sin cuenta: el cliente paga ANTES de existir en el sistema, y el webhook
// le crea la cuenta. Aquí se cubre lo que no se puede probar a mano sin cobrarle
// a alguien de verdad: que no se cree la cuenta si el monto no coincide, que un
// correo ya registrado no se pise, y que las credenciales salgan por correo.

jest.mock('https', () => ({ request: jest.fn() }));

jest.mock('../../config/database', () => ({
  prisma: {
    user: { findUnique: jest.fn(), create: jest.fn() },
    business: { update: jest.fn() },
    seller: { findFirst: jest.fn() },
    guestCheckout: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../../config/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../config/email', () => ({ emailService: { sendCredenciales: jest.fn().mockResolvedValue(true) } }));
jest.mock('../../controllers/auth.controller', () => ({
  createBusinessForOwner: jest.fn(),
}));

import * as https from 'https';
import { createBusinessForOwner } from '../../controllers/auth.controller';

const mockPrisma = prisma as unknown as {
  user: { findUnique: jest.Mock; create: jest.Mock };
  business: { update: jest.Mock };
  seller: { findFirst: jest.Mock };
  guestCheckout: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};
const mockHttps = https.request as jest.Mock;

function mockWompi(body: unknown, statusCode = 200) {
  mockHttps.mockImplementation((_o: unknown, cb: (r: unknown) => void) => {
    const res: Record<string, unknown> = {
      statusCode,
      on: (ev: string, h: (...a: unknown[]) => void) => {
        if (ev === 'data') h(JSON.stringify(body));
        if (ev === 'end') h();
        return res;
      },
    };
    cb(res);
    return { on: jest.fn(), write: jest.fn(), end: jest.fn() };
  });
}

const makeRes = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json };
};
const next = jest.fn() as unknown as NextFunction;
const makeReq = (body: Record<string, unknown>) => ({ body, params: {}, query: {}, headers: {} } as unknown as Request);

const datos = {
  productType: 'pos', period: 'monthly',
  name: 'Cristian', lastName: 'Rojas', document: '1085123456', email: 'nuevo@cliente.com',
};

describe('checkout sin cuenta — abrir el pago', () => {
  beforeEach(() => jest.clearAllMocks());

  it('guarda la compra y devuelve el link de Wompi', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockWompi({ data: { id: 'link-1' } });
    mockPrisma.guestCheckout.create.mockResolvedValue({});

    const { res, json } = makeRes();
    await paymentController.checkoutInvitado(makeReq({ ...datos, sellerSlug: 'Lina' }), res, next);

    expect(json).toHaveBeenCalledWith(expect.objectContaining({ data: { url: 'https://checkout.wompi.co/l/link-1' } }));
    expect(mockPrisma.guestCheckout.create.mock.calls[0][0].data).toMatchObject({
      paymentLinkId: 'link-1', productType: 'pos', period: 'monthly',
      amount: 29900, months: 1, buyerEmail: 'nuevo@cliente.com',
      sellerSlug: 'lina', // normalizado a minúsculas
      buyerDoc: '1085123456',
    });
  });

  it('cobra el precio del periodo elegido', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockWompi({ data: { id: 'link-2' } });
    await paymentController.checkoutInvitado(makeReq({ ...datos, period: 'annual' }), makeRes().res, next);
    expect(mockPrisma.guestCheckout.create.mock.calls[0][0].data).toMatchObject({ amount: 287000, months: 12 });
  });

  it('Contable siempre es anual, aunque pidan otro periodo', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockWompi({ data: { id: 'link-3' } });
    await paymentController.checkoutInvitado(makeReq({ ...datos, productType: 'contable', period: 'monthly' }), makeRes().res, next);
    expect(mockPrisma.guestCheckout.create.mock.calls[0][0].data).toMatchObject({ amount: 120000, months: 12, period: 'annual' });
  });

  it('rechaza a quien YA tiene cuenta: ese pago debe hacerse desde adentro', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1' });
    await paymentController.checkoutInvitado(makeReq(datos), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(409);
    expect(mockPrisma.guestCheckout.create).not.toHaveBeenCalled();
  });

  it('exige nombre, apellidos, cédula y correo válidos', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const malos = [
      { ...datos, name: '' },
      { ...datos, lastName: '' },
      { ...datos, document: '12' },
      { ...datos, email: 'no-es-correo' },
    ];
    for (const malo of malos) {
      (next as jest.Mock).mockClear();
      await paymentController.checkoutInvitado(makeReq(malo), makeRes().res, next);
      expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(400);
    }
    expect(mockPrisma.guestCheckout.create).not.toHaveBeenCalled();
  });

  it('si Wompi falla, no se guarda una compra huérfana', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockWompi({ error: 'no disponible' }, 500);
    await paymentController.checkoutInvitado(makeReq(datos), makeRes().res, next);
    expect((next as jest.Mock).mock.calls[0][0].statusCode).toBe(502);
    expect(mockPrisma.guestCheckout.create).not.toHaveBeenCalled();
  });
});

describe('tras el pago — crear la cuenta y mandar las claves', () => {
  const compra = {
    id: 'g-1', buyerName: 'Cristian', buyerLastName: 'Rojas', buyerEmail: 'nuevo@cliente.com',
    productType: 'pos', months: 1, amount: 29900, sellerSlug: 'lina',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (fn: (c: unknown) => unknown) => fn(mockPrisma));
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'u-nuevo' });
    (createBusinessForOwner as jest.Mock).mockResolvedValue({ id: 'biz-nuevo' });
    mockPrisma.business.update.mockResolvedValue({});
    mockPrisma.guestCheckout.update.mockResolvedValue({});
    mockPrisma.seller.findFirst.mockResolvedValue({ id: 'seller-1' });
  });

  it('crea el usuario ya verificado y con el plan pagado', async () => {
    await provisionarCompraInvitado(compra, { id: 'tx-1', amount_in_cents: 2990000 });

    const usuario = mockPrisma.user.create.mock.calls[0][0].data;
    expect(usuario).toMatchObject({ name: 'Cristian Rojas', email: 'nuevo@cliente.com', role: 'ADMIN', isEmailVerified: true });
    expect(usuario.password).not.toBe('');
    expect(mockPrisma.business.update.mock.calls[0][0].data).toMatchObject({ plan: 'pro', paymentRef: 'tx-1' });
  });

  it('manda al correo las credenciales, con la contraseña que se generó', async () => {
    await provisionarCompraInvitado(compra, { id: 'tx-1', amount_in_cents: 2990000 });

    expect(emailService.sendCredenciales).toHaveBeenCalledTimes(1);
    const [to, nombre, password, producto] = (emailService.sendCredenciales as jest.Mock).mock.calls[0];
    expect(to).toBe('nuevo@cliente.com');
    expect(nombre).toBe('Cristian');
    expect(password).toHaveLength(10);
    expect(producto).toBe('pos');
  });

  it('le acredita la venta a la vendedora que compartió el link', async () => {
    await provisionarCompraInvitado(compra, { id: 'tx-1', amount_in_cents: 2990000 });
    expect(mockPrisma.seller.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { slug: 'lina' } }));
    expect(mockPrisma.business.update.mock.calls[0][0].data).toMatchObject({ createdBySellerId: 'seller-1' });
  });

  it('sin vendedora en el link, la venta queda sin dueña (compra directa)', async () => {
    await provisionarCompraInvitado({ ...compra, sellerSlug: null }, { id: 'tx-1', amount_in_cents: 2990000 });
    expect(mockPrisma.seller.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.business.update.mock.calls[0][0].data.createdBySellerId).toBeUndefined();
  });

  it('marca la compra como atendida para que un webhook repetido no cree otra cuenta', async () => {
    await provisionarCompraInvitado(compra, { id: 'tx-1', amount_in_cents: 2990000 });
    expect(mockPrisma.guestCheckout.update.mock.calls[0][0].data).toMatchObject({
      status: 'provisioned', transactionId: 'tx-1', businessId: 'biz-nuevo',
    });
  });

  it('si el correo con las claves no sale, la cuenta queda marcada para avisar a mano', async () => {
    // El cliente ya pagó: un correo perdido no puede quedar solo en un log,
    // porque se queda sin saber cómo entrar.
    (emailService.sendCredenciales as jest.Mock).mockResolvedValue(false);
    await provisionarCompraInvitado(compra, { id: 'tx-1', amount_in_cents: 2990000 });

    const guardado = mockPrisma.guestCheckout.update.mock.calls[0][0].data;
    expect(guardado.status).toBe('provisioned'); // la cuenta sí existe
    expect(guardado.errorMessage).toContain('correo');
  });

  it('NO crea la cuenta si el monto pagado no es el del plan', async () => {
    // Un link manipulado no puede activar un plan de $287.000 pagando $1.000.
    await provisionarCompraInvitado(compra, { id: 'tx-1', amount_in_cents: 100000 });

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(emailService.sendCredenciales).not.toHaveBeenCalled();
    expect(mockPrisma.guestCheckout.update.mock.calls[0][0].data).toMatchObject({ status: 'failed' });
  });

  it('no pisa una cuenta si el correo se registró entre el pago y el webhook', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-existente' });
    await provisionarCompraInvitado(compra, { id: 'tx-1', amount_in_cents: 2990000 });

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
    expect(mockPrisma.guestCheckout.update.mock.calls[0][0].data).toMatchObject({ status: 'failed' });
  });

  it('si la creación falla, la compra queda registrada para atenderla a mano', async () => {
    // El dinero ya entró: el fallo no se puede perder en un log.
    mockPrisma.$transaction.mockRejectedValue(new Error('base caída'));
    await provisionarCompraInvitado(compra, { id: 'tx-1', amount_in_cents: 2990000 });

    expect(mockPrisma.guestCheckout.update.mock.calls[0][0].data).toMatchObject({
      status: 'failed', transactionId: 'tx-1',
    });
    expect((mockPrisma.guestCheckout.update.mock.calls[0][0].data as { errorMessage: string }).errorMessage).toContain('base caída');
    expect(emailService.sendCredenciales).not.toHaveBeenCalled();
  });
});
