import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../config/database', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    business: { create: jest.fn() },
    expenseCategory: { createMany: jest.fn() },
    // Default: handles both array form and function form
    $transaction: jest.fn().mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : Promise.resolve()
    ),
  },
}));

jest.mock('../../config/redis', () => ({
  cache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  },
}));

jest.mock('../../config/email', () => ({
  emailService: {
    sendVerification: jest.fn().mockResolvedValue(undefined),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('$2a$12$hashed'),
  compare: jest.fn(),
}));

jest.mock('../../utils/jwt', () => ({
  generateAccessToken: jest.fn().mockReturnValue('mock-access-token'),
  generateRefreshToken: jest.fn().mockReturnValue('mock-refresh-token'),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockJwt = jwtUtils as jest.Mocked<typeof jwtUtils>;

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    name: 'Test User',
    email: 'test@example.com',
    password: '$2a$12$hashed',
    role: 'ADMIN',
    isActive: true,
    isEmailVerified: true,
    avatar: null,
    branchId: 'branch-1',
    deletedAt: null,
    lastLogin: null,
    branch: {
      id: 'branch-1',
      businessId: 'biz-1',
      business: { id: 'biz-1', name: 'Mi Tienda', plan: 'free' },
    },
    ...overrides,
  };
}

// ─── POST /register ───────────────────────────────────────────────────────────

describe('POST /api/v1/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 422 cuando falta el email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ana', password: 'password123' });
    expect(res.status).toBe(422);
  });

  it('retorna 422 cuando la contraseña tiene menos de 8 caracteres', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: '123' });
    expect(res.status).toBe(422);
  });

  it('retorna 409 cuando el email ya está registrado', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser());
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ana', email: 'test@example.com', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/email ya está registrado/i);
  });

  it('retorna 403 cuando se intenta crear un SUPER_ADMIN', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Admin', email: 'admin@test.com', password: 'password123', role: 'SUPER_ADMIN' });
    expect(res.status).toBe(403);
  });

  it('retorna 201 y crea el usuario correctamente', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const createdUser = { id: 'user-2', name: 'Ana', email: 'ana@test.com', role: 'ADMIN' };
    // mockImplementationOnce so it doesn't pollute subsequent tests
    (mockPrisma.$transaction as jest.Mock).mockImplementationOnce(async (fn: any) =>
      fn({
        user: {
          create: jest.fn().mockResolvedValue(createdUser),
          update: jest.fn().mockResolvedValue({}),
        },
        business: {
          create: jest.fn().mockResolvedValue({ id: 'biz-2', branches: [{ id: 'br-2' }] }),
        },
        expenseCategory: { createMany: jest.fn().mockResolvedValue({ count: 8 }) },
      })
    );

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Ana', email: 'ana@test.com', password: 'password123', businessName: 'Tienda Ana' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

// ─── POST /login ──────────────────────────────────────────────────────────────

describe('POST /api/v1/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 422 cuando falta la contraseña', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(422);
  });

  it('retorna 401 cuando el usuario no existe', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'noexiste@test.com', password: 'cualquiera123' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/credenciales/i);
  });

  it('retorna 401 cuando la contraseña es incorrecta', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser());
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(false);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('retorna 403 cuando la cuenta está inactiva', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ isActive: false }));
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/desactivada/i);
  });

  it('retorna 403 cuando el email no está verificado', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser({ isEmailVerified: false }));
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/verifica tu correo/i);
  });

  it('retorna 200 con accessToken cuando las credenciales son correctas', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser());
    (mockBcrypt.compare as jest.Mock).mockResolvedValue(true);
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBe('mock-access-token');
    expect(res.body.data.user.email).toBe('test@example.com');
  });
});

// ─── GET /me ──────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/me', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 401 cuando no hay token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('retorna 401 cuando el token es inválido', async () => {
    mockJwt.verifyAccessToken.mockImplementation(() => { throw new Error('jwt invalid'); });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer token-invalido');
    expect(res.status).toBe(401);
  });

  it('retorna 200 con datos del usuario cuando el token es válido', async () => {
    const payload = { userId: 'user-1', email: 'test@example.com', role: 'ADMIN', businessId: 'biz-1' };
    mockJwt.verifyAccessToken.mockReturnValue(payload);
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(makeUser());

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe('test@example.com');
  });
});

// ─── POST /refresh-token ──────────────────────────────────────────────────────

describe('POST /api/v1/auth/refresh-token', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 403 cuando falta el header anti-CSRF', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', 'refreshToken=valid-refresh');
    expect(res.status).toBe(403);
  });

  it('retorna 401 cuando no hay cookie refreshToken', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(401);
  });

  it('retorna 401 cuando el refresh token no existe en BD', async () => {
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', 'refreshToken=invalid-token')
      .set('X-Requested-With', 'XMLHttpRequest');
    expect(res.status).toBe(401);
  });

  it('retorna 200 con nuevo accessToken cuando el refresh token es válido', async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    (mockPrisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      token: 'valid-refresh', userId: 'user-1', expiresAt: futureDate,
    });
    mockJwt.verifyRefreshToken.mockReturnValue({ userId: 'user-1', email: 'test@example.com', role: 'ADMIN' });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser());
    (mockPrisma.refreshToken.delete as jest.Mock).mockResolvedValue({});
    (mockPrisma.refreshToken.create as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/v1/auth/refresh-token')
      .set('Cookie', 'refreshToken=valid-refresh')
      .set('X-Requested-With', 'XMLHttpRequest');

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBe('mock-access-token');
  });
});