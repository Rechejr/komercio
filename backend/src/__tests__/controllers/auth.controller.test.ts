import crypto from 'crypto';
import { Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { authController } from '../../controllers/auth.controller';
import { prisma } from '../../config/database';
import { cache } from '../../config/redis';
import { emailService } from '../../config/email';
import { AuthRequest } from '../../middlewares/auth';

// Complementa a routes/auth.routes.test.ts (que cubre register, login, /me y
// refresh-token a través de HTTP). Aquí se prueban, llamando al controlador
// directo, las piezas que faltaban: verificación de correo, recuperación y
// cambio de clave, logout y toda la multicuenta (POS ↔ Contable).

jest.mock('../../config/database', () => {
  const prismaMock: any = {
    user: {
      findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(),
      create: jest.fn(), findUniqueOrThrow: jest.fn(),
    },
    branch: { findUnique: jest.fn() },
    business: { create: jest.fn(), count: jest.fn() },
    expenseCategory: { createMany: jest.fn() },
    paymentAccount: { createMany: jest.fn() },
    refreshToken: { create: jest.fn(), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((cb: any) => (typeof cb === 'function' ? cb(prismaMock) : Promise.all(cb))),
  };
  return { prisma: prismaMock };
});

jest.mock('../../config/redis', () => ({
  cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue('OK'), del: jest.fn().mockResolvedValue(1) },
}));

jest.mock('../../config/email', () => ({
  emailService: {
    sendVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashed'),
  compare: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../utils/jwt', () => ({
  generateAccessToken: jest.fn().mockReturnValue('access-token-nuevo'),
  generateRefreshToken: jest.fn().mockReturnValue('refresh-token-nuevo'),
  verifyRefreshToken: jest.fn(),
}));

const mockPrisma = prisma as any;
const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

function makeReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    user: { userId: 'u-1', email: 'due@no.com', role: 'ADMIN', businessId: 'biz-pos', branchId: 'br-pos' },
    params: {},
    query: {},
    body: {},
    cookies: {},
    ...overrides,
  } as unknown as AuthRequest;
}

function makeRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  const cookie = jest.fn();
  const clearCookie = jest.fn();
  return { res: { json, status, cookie, clearCookie } as unknown as Response, json, status, cookie, clearCookie };
}

// `next` fresco por test para poder inspeccionar el error que recibió.
function makeNext() {
  return jest.fn() as unknown as NextFunction & jest.Mock;
}

function errorDe(next: NextFunction) {
  const mock = next as unknown as jest.Mock;
  expect(mock).toHaveBeenCalledTimes(1);
  return mock.mock.calls[0][0] as { message: string; statusCode: number };
}

// Dueño con las dos cuentas (POS y Contable) bajo el mismo correo.
const usuarioMulticuenta = {
  id: 'u-1',
  name: 'Cristian',
  email: 'due@no.com',
  role: 'ADMIN',
  avatar: null,
  isEmailVerified: true,
  branchId: 'br-pos',
  branch: { id: 'br-pos', businessId: 'biz-pos', business: { id: 'biz-pos', name: 'Mi Tienda', plan: 'pro', type: 'pos' } },
  businesses: [
    { id: 'biz-pos', name: 'Mi Tienda', plan: 'pro', type: 'pos', branches: [{ id: 'br-pos' }] },
    { id: 'biz-cont', name: 'Mi Contable', plan: 'free', type: 'contable', branches: [{ id: 'br-cont' }] },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  (bcrypt.hash as jest.Mock).mockResolvedValue('$2a$12$hashed');
  (bcrypt.compare as jest.Mock).mockResolvedValue(true);
});

// ─── verifyEmail ─────────────────────────────────────────────────────────────

describe('authController.verifyEmail', () => {
  it('busca por el HASH del token, nunca por el token plano', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
    const { res } = makeRes();

    await authController.verifyEmail(makeReq({ params: { token: 'token-plano' } } as never), res, makeNext());

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { emailVerifyToken: sha256('token-plano'), isEmailVerified: false },
    });
  });

  it('marca el correo como verificado y quema el token', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
    const { res, json } = makeRes();

    await authController.verifyEmail(makeReq({ params: { token: 'tok' } } as never), res, makeNext());

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { isEmailVerified: true, emailVerifyToken: null },
    });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rechaza con 400 si el token no existe o la cuenta ya estaba verificada', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await authController.verifyEmail(makeReq({ params: { token: 'viejo' } } as never), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

// ─── resendVerification ──────────────────────────────────────────────────────

describe('authController.resendVerification', () => {
  it('no revela que el correo no existe y no manda nada', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const { res, json } = makeRes();

    await authController.resendVerification(makeReq({ body: { email: 'nadie@x.com' } }), res, makeNext());

    expect(emailService.sendVerification).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('no reenvía si la cuenta ya está verificada', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', isEmailVerified: true });
    const { res } = makeRes();

    await authController.resendVerification(makeReq({ body: { email: 'due@no.com' } }), res, makeNext());

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(emailService.sendVerification).not.toHaveBeenCalled();
  });

  it('guarda el hash en BD pero envía por correo el token plano', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', email: 'due@no.com', name: 'Cristian', isEmailVerified: false });
    const { res } = makeRes();

    await authController.resendVerification(makeReq({ body: { email: 'due@no.com' } }), res, makeNext());

    const tokenEnviado = (emailService.sendVerification as jest.Mock).mock.calls[0][2];
    const guardado = mockPrisma.user.update.mock.calls[0][0].data.emailVerifyToken;
    expect(guardado).toBe(sha256(tokenEnviado));
    expect(guardado).not.toBe(tokenEnviado);
  });
});

// ─── forgotPassword / resetPassword ──────────────────────────────────────────

describe('authController.forgotPassword', () => {
  it('responde igual aunque el correo no exista (no filtra usuarios)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const { res, json } = makeRes();

    await authController.forgotPassword(makeReq({ body: { email: 'nadie@x.com' } }), res, makeNext());

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(emailService.sendPasswordReset).not.toHaveBeenCalled();
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('guarda el hash con vencimiento de 1 hora y lo replica en caché', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', email: 'due@no.com', name: 'Cristian' });
    const { res } = makeRes();
    const antes = Date.now();

    await authController.forgotPassword(makeReq({ body: { email: 'due@no.com' } }), res, makeNext());

    const tokenEnviado = (emailService.sendPasswordReset as jest.Mock).mock.calls[0][2];
    const data = mockPrisma.user.update.mock.calls[0][0].data;
    expect(data.resetPasswordToken).toBe(sha256(tokenEnviado));
    const margen = data.resetPasswordExpires.getTime() - antes;
    expect(margen).toBeGreaterThan(59 * 60 * 1000);
    expect(margen).toBeLessThanOrEqual(60 * 60 * 1000 + 1000);
    expect(cache.set).toHaveBeenCalledWith(`reset:${sha256(tokenEnviado)}`, 'u-1', 3600);
  });
});

describe('authController.resetPassword', () => {
  it('exige que el token siga vigente', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await authController.resetPassword(makeReq({ body: { token: 'vencido', password: 'NuevaClave1' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    // El filtro de vigencia va en la consulta, no en código posterior.
    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
      where: { resetPasswordToken: sha256('vencido'), resetPasswordExpires: { gt: expect.any(Date) } },
    });
  });

  it('cambia la clave, quema el token y cierra todas las sesiones abiertas', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'u-1' });
    const { res, json } = makeRes();

    await authController.resetPassword(makeReq({ body: { token: 'tok', password: 'NuevaClave1' } }), res, makeNext());

    expect(bcrypt.hash).toHaveBeenCalledWith('NuevaClave1', 12);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { password: '$2a$12$hashed', resetPasswordToken: null, resetPasswordExpires: null },
    });
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
    expect(cache.del).toHaveBeenCalledWith(`reset:${sha256('tok')}`);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── changePassword ──────────────────────────────────────────────────────────

describe('authController.changePassword', () => {
  it('rechaza si la contraseña actual no coincide', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', password: '$2a$12$viejo' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    const { res } = makeRes();
    const next = makeNext();

    await authController.changePassword(makeReq({ body: { currentPassword: 'mala', newPassword: 'NuevaClave1' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('actualiza la clave y revoca las sesiones del usuario', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u-1', password: '$2a$12$viejo' });
    const { res, json } = makeRes();

    await authController.changePassword(makeReq({ body: { currentPassword: 'buena', newPassword: 'NuevaClave1' } }), res, makeNext());

    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: 'u-1' }, data: { password: '$2a$12$hashed' } });
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u-1' } });
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

// ─── logout ──────────────────────────────────────────────────────────────────

describe('authController.logout', () => {
  it('borra el refresh token de la cookie y limpia la cookie', async () => {
    const { res, clearCookie } = makeRes();

    await authController.logout(makeReq({ cookies: { refreshToken: 'rt-1' } } as never), res, makeNext());

    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { token: 'rt-1' } });
    expect(clearCookie).toHaveBeenCalledWith('refreshToken', expect.objectContaining({ httpOnly: true }));
  });

  it('sin token no borra nada pero igual limpia la cookie', async () => {
    const { res, clearCookie } = makeRes();

    await authController.logout(makeReq(), res, makeNext());

    expect(mockPrisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    expect(clearCookie).toHaveBeenCalled();
  });
});

// ─── me (multicuenta) ────────────────────────────────────────────────────────

describe('authController.me', () => {
  it('lista las dos cuentas del dueño y refleja la sucursal ACTIVA del token', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(usuarioMulticuenta);
    mockPrisma.branch.findUnique.mockResolvedValue({
      id: 'br-cont', name: 'Bodega Principal',
      business: { id: 'biz-cont', name: 'Mi Contable', currency: 'COP', logo: null, plan: 'free', type: 'contable' },
    });
    const { res, json } = makeRes();

    // El token apunta a la cuenta Contable aunque su sucursal asignada sea la del POS.
    await authController.me(makeReq({ user: { userId: 'u-1', branchId: 'br-cont' } } as never), res, makeNext());

    const data = json.mock.calls[0][0].data;
    expect(data.branchId).toBe('br-cont');
    expect(data.accounts).toEqual([
      expect.objectContaining({ businessId: 'biz-pos', businessType: 'pos' }),
      expect.objectContaining({ businessId: 'biz-cont', businessType: 'contable' }),
    ]);
  });

  it('al empleado le da solo la cuenta de su sucursal', async () => {
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u-2', name: 'Vendedor', email: 'emp@x.com', role: 'CASHIER', branchId: 'br-pos',
      branch: { id: 'br-pos', businessId: 'biz-pos', business: { id: 'biz-pos', name: 'Mi Tienda', plan: 'pro', type: 'pos' } },
      businesses: [],
    });
    mockPrisma.branch.findUnique.mockResolvedValue({ id: 'br-pos', name: 'Principal', business: { id: 'biz-pos' } });
    const { res, json } = makeRes();

    await authController.me(makeReq({ user: { userId: 'u-2', branchId: 'br-pos' } } as never), res, makeNext());

    expect(json.mock.calls[0][0].data.accounts).toEqual([
      expect.objectContaining({ businessId: 'biz-pos', businessName: 'Mi Tienda' }),
    ]);
  });

  it('404 si el usuario fue desactivado o borrado', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.branch.findUnique.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await authController.me(makeReq(), res, next);

    expect(errorDe(next).statusCode).toBe(404);
  });
});

// ─── switchBusiness ──────────────────────────────────────────────────────────

describe('authController.switchBusiness', () => {
  it('exige businessId', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await authController.switchBusiness(makeReq({ body: {} }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('bloquea con 403 el salto a un negocio ajeno', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(usuarioMulticuenta);
    const { res } = makeRes();
    const next = makeNext();

    await authController.switchBusiness(makeReq({ body: { businessId: 'biz-de-otro' } }), res, next);

    expect(errorDe(next).statusCode).toBe(403);
    expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('reemite la sesión anclada a la sucursal de la cuenta destino', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(usuarioMulticuenta);
    const { res, json, cookie } = makeRes();

    await authController.switchBusiness(makeReq({ body: { businessId: 'biz-cont' } }), res, makeNext());

    const { generateAccessToken } = jest.requireMock('../../utils/jwt');
    expect(generateAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-1', businessId: 'biz-cont', branchId: 'br-cont' }),
    );
    expect(cookie).toHaveBeenCalledWith('refreshToken', 'refresh-token-nuevo', expect.objectContaining({ httpOnly: true }));
    const data = json.mock.calls[0][0].data;
    expect(data.accessToken).toBe('access-token-nuevo');
    expect(data.user.businessType).toBe('contable');
    expect(data.user.businessId).toBe('biz-cont');
  });

  it('404 si el usuario ya no está activo', async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const { res } = makeRes();
    const next = makeNext();

    await authController.switchBusiness(makeReq({ body: { businessId: 'biz-cont' } }), res, next);

    expect(errorDe(next).statusCode).toBe(404);
  });
});

// ─── activarProducto ─────────────────────────────────────────────────────────

describe('authController.activarProducto', () => {
  it('exige nombre de negocio', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await authController.activarProducto(makeReq({ body: { businessType: 'contable', businessName: '   ' } }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('impide activar dos veces el mismo producto (409)', async () => {
    mockPrisma.business.count.mockResolvedValue(1);
    const { res } = makeRes();
    const next = makeNext();

    await authController.activarProducto(makeReq({ body: { businessType: 'contable', businessName: 'Mi Contable' } }), res, next);

    expect(errorDe(next).statusCode).toBe(409);
    expect(mockPrisma.business.create).not.toHaveBeenCalled();
  });

  it('crea la cuenta Contable con prueba gratis y sin catálogos de POS', async () => {
    mockPrisma.business.count.mockResolvedValue(0);
    mockPrisma.business.create.mockResolvedValue({ id: 'biz-cont', name: 'Mi Contable', branches: [{ id: 'br-cont' }] });
    const { res, json, status } = makeRes();

    await authController.activarProducto(makeReq({ body: { businessType: 'contable', businessName: '  Mi Contable  ' } }), res, makeNext());

    const data = mockPrisma.business.create.mock.calls[0][0].data;
    expect(data.name).toBe('Mi Contable'); // recortado
    expect(data.type).toBe('contable');
    expect(data.ownerId).toBe('u-1');
    expect(data.planExpiresAt).toBeInstanceOf(Date); // prueba gratis
    // La cuenta Contable no lleva categorías de gasto ni medios de pago.
    expect(mockPrisma.expenseCategory.createMany).not.toHaveBeenCalled();
    expect(mockPrisma.paymentAccount.createMany).not.toHaveBeenCalled();
    // Activar el producto hermano NO debe mover la sucursal principal del dueño.
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('el POS sí nace con sus categorías de gasto y medios de pago', async () => {
    mockPrisma.business.count.mockResolvedValue(0);
    mockPrisma.business.create.mockResolvedValue({ id: 'biz-pos2', name: 'Otra Tienda', branches: [{ id: 'br-2' }] });
    const { res } = makeRes();

    await authController.activarProducto(makeReq({ body: { businessType: 'pos', businessName: 'Otra Tienda' } }), res, makeNext());

    expect(mockPrisma.business.create.mock.calls[0][0].data.planExpiresAt).toBeNull();
    expect(mockPrisma.expenseCategory.createMany).toHaveBeenCalled();
    expect(mockPrisma.paymentAccount.createMany).toHaveBeenCalled();
  });
});

// ─── googleAuth ──────────────────────────────────────────────────────────────

describe('authController.googleAuth', () => {
  const CLIENT_ID = '123-abc.apps.googleusercontent.com';
  const clientIdOriginal = process.env.GOOGLE_CLIENT_ID;

  // Respuestas de las dos llamadas a Google: primero tokeninfo (valida la
  // audiencia), después userinfo (trae el perfil).
  function mockGoogle(tokenInfo: unknown, userInfo: unknown, opts: { tokenInfoOk?: boolean; userInfoOk?: boolean } = {}) {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: opts.tokenInfoOk !== false, json: async () => tokenInfo })
      .mockResolvedValueOnce({ ok: opts.userInfoOk !== false, json: async () => userInfo });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  const perfilGoogle = { sub: 'g-999', email: 'nuevo@gmail.com', name: 'Cristian', picture: 'https://foto' };

  beforeEach(() => { process.env.GOOGLE_CLIENT_ID = CLIENT_ID; });
  afterAll(() => {
    if (clientIdOriginal === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = clientIdOriginal;
  });

  it('exige el token de Google', async () => {
    const { res } = makeRes();
    const next = makeNext();

    await authController.googleAuth(makeReq({ body: {} }), res, next);

    expect(errorDe(next).statusCode).toBe(400);
  });

  it('responde 503 si el servidor no tiene GOOGLE_CLIENT_ID configurado', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const { res } = makeRes();
    const next = makeNext();

    await authController.googleAuth(makeReq({ body: { accessToken: 'g-tok' } }), res, next);

    expect(errorDe(next).statusCode).toBe(503);
  });

  it('rechaza un token válido de Google emitido para OTRA aplicación', async () => {
    // Sin este chequeo de audiencia, el token de cualquier app de Google
    // serviría para entrar: userinfo por sí solo no lo detecta.
    mockGoogle({ aud: 'otra-app.apps.googleusercontent.com', sub: 'g-999' }, perfilGoogle);
    const { res } = makeRes();
    const next = makeNext();

    await authController.googleAuth(makeReq({ body: { accessToken: 'g-tok' } }), res, next);

    expect(errorDe(next).statusCode).toBe(401);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('rechaza si Google dice que el token no sirve', async () => {
    mockGoogle({ error: 'invalid_token' }, perfilGoogle, { tokenInfoOk: false });
    const { res } = makeRes();
    const next = makeNext();

    await authController.googleAuth(makeReq({ body: { accessToken: 'vencido' } }), res, next);

    expect(errorDe(next).statusCode).toBe(401);
  });

  it('enlaza la cuenta de Google a un usuario que ya existía por correo', async () => {
    mockGoogle({ aud: CLIENT_ID, sub: 'g-999' }, perfilGoogle);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u-1', name: 'Cristian', email: 'nuevo@gmail.com', role: 'ADMIN', avatar: null,
      googleId: null, isActive: true, isEmailVerified: true, branchId: 'br-pos',
      branch: { id: 'br-pos', businessId: 'biz-pos', business: { id: 'biz-pos', name: 'Mi Tienda', plan: 'pro' } },
    });
    const { res, json } = makeRes();

    await authController.googleAuth(makeReq({ body: { accessToken: 'g-tok' } }), res, makeNext());

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { googleId: 'g-999', avatar: 'https://foto' },
    });
    expect(mockPrisma.user.create).not.toHaveBeenCalled(); // no duplica la cuenta
    expect(json.mock.calls[0][0].data.accessToken).toBe('access-token-nuevo');
  });

  it('crea usuario y negocio la primera vez que entra con Google', async () => {
    mockGoogle({ aud: CLIENT_ID, sub: 'g-999' }, perfilGoogle);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'u-nuevo', name: 'Cristian', email: 'nuevo@gmail.com' });
    mockPrisma.business.create.mockResolvedValue({ id: 'biz-nuevo', branches: [{ id: 'br-nuevo' }] });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'u-nuevo', name: 'Cristian', email: 'nuevo@gmail.com', role: 'ADMIN', avatar: 'https://foto',
      isActive: true, isEmailVerified: true, branchId: 'br-nuevo',
      branch: { id: 'br-nuevo', businessId: 'biz-nuevo', business: { id: 'biz-nuevo', name: 'Negocio de Cristian', plan: 'free' } },
    });
    const { res, json, cookie } = makeRes();

    await authController.googleAuth(makeReq({ body: { accessToken: 'g-tok' } }), res, makeNext());

    const datosUsuario = mockPrisma.user.create.mock.calls[0][0].data;
    expect(datosUsuario.email).toBe('nuevo@gmail.com');
    expect(datosUsuario.googleId).toBe('g-999');
    expect(datosUsuario.isEmailVerified).toBe(true); // Google ya verificó el correo
    expect(datosUsuario.role).toBe('ADMIN');
    expect(mockPrisma.business.create).toHaveBeenCalled();
    expect(cookie).toHaveBeenCalledWith('refreshToken', 'refresh-token-nuevo', expect.objectContaining({ httpOnly: true }));
    expect(json.mock.calls[0][0].data.user.businessId).toBe('biz-nuevo');
  });

  it('el negocio nace COMPLETO, igual que en el registro con correo', async () => {
    // Entrar con Google crea la cuenta al vuelo. Si ese negocio naciera sin
    // medios de pago, el dueño abriría el POS sin nada con qué cobrar: por eso
    // pasa por createBusinessForOwner, el mismo camino que el registro normal.
    mockGoogle({ aud: CLIENT_ID, sub: 'g-999' }, perfilGoogle);
    mockPrisma.user.findFirst.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({ id: 'u-nuevo', name: 'Cristian', email: 'nuevo@gmail.com' });
    mockPrisma.business.create.mockResolvedValue({ id: 'biz-nuevo', branches: [{ id: 'br-nuevo' }] });
    mockPrisma.user.findUniqueOrThrow.mockResolvedValue({
      id: 'u-nuevo', name: 'Cristian', email: 'nuevo@gmail.com', role: 'ADMIN',
      isActive: true, isEmailVerified: true, branchId: 'br-nuevo',
      branch: { id: 'br-nuevo', businessId: 'biz-nuevo', business: { id: 'biz-nuevo', name: 'Negocio de Cristian', plan: 'free' } },
    });
    const { res } = makeRes();

    await authController.googleAuth(makeReq({ body: { accessToken: 'g-tok' } }), res, makeNext());

    // Bodega principal, categorías de gasto y —lo que faltaba— medios de pago.
    expect(mockPrisma.business.create.mock.calls[0][0].data.branches.create.name).toBe('Bodega Principal');
    expect(mockPrisma.expenseCategory.createMany).toHaveBeenCalled();
    expect(mockPrisma.paymentAccount.createMany).toHaveBeenCalled();
    const medios = mockPrisma.paymentAccount.createMany.mock.calls[0][0].data;
    expect(medios.map((m: { name: string }) => m.name)).toEqual(
      expect.arrayContaining(['Efectivo', 'Nequi', 'Daviplata']),
    );
    expect(medios.every((m: { businessId: string }) => m.businessId === 'biz-nuevo')).toBe(true);
    // Y el usuario queda anclado a esa bodega.
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-nuevo' }, data: { branchId: 'br-nuevo' },
    });
  });

  it('no deja entrar a una cuenta desactivada', async () => {
    mockGoogle({ aud: CLIENT_ID, sub: 'g-999' }, perfilGoogle);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: 'u-1', email: 'nuevo@gmail.com', googleId: 'g-999', isActive: false, branch: null,
    });
    const { res, cookie } = makeRes();
    const next = makeNext();

    await authController.googleAuth(makeReq({ body: { accessToken: 'g-tok' } }), res, next);

    expect(errorDe(next).statusCode).toBe(403);
    expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });
});
