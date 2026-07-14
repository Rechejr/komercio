import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../config/database', () => ({
  prisma: {
    business: { findUnique: jest.fn(), update: jest.fn() },
    branch: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock('../../config/redis', () => ({
  cache: { get: jest.fn().mockResolvedValue(null), set: jest.fn(), del: jest.fn() },
}));

jest.mock('../../utils/jwt', () => ({
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyAccessToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockJwt = jwtUtils as jest.Mocked<typeof jwtUtils>;

function authHeader(role: string) {
  mockJwt.verifyAccessToken.mockReturnValue({
    userId: 'user-1', email: 'admin@test.com', role, businessId: 'biz-1', branchId: 'branch-1',
  } as any);
  return { Authorization: 'Bearer valid-token' };
}

function mockBusinessWithPlan(plan: 'free' | 'pro', branchCount: number) {
  (mockPrisma.business.findUnique as jest.Mock).mockResolvedValue({
    id: 'biz-1', plan, planExpiresAt: null,
    branches: Array.from({ length: branchCount }, (_, i) => ({ id: `branch-${i}` })),
  });
  (mockPrisma.branch.count as jest.Mock).mockResolvedValue(branchCount);
}

describe('POST /api/v1/business/branches', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 403 si el usuario no es ADMIN', async () => {
    const res = await request(app)
      .post('/api/v1/business/branches')
      .set(authHeader('CASHIER'))
      .send({ name: 'Sucursal 2' });
    expect(res.status).toBe(403);
  });

  it('retorna 400 si falta el nombre', async () => {
    mockBusinessWithPlan('pro', 1);
    const res = await request(app)
      .post('/api/v1/business/branches')
      .set(authHeader('ADMIN'))
      .send({ name: '  ' });
    expect(res.status).toBe(400);
  });

  it('crea la sucursal cuando el negocio está bajo el límite del plan', async () => {
    mockBusinessWithPlan('pro', 1);
    (mockPrisma.branch.create as jest.Mock).mockResolvedValue({
      id: 'branch-new', name: 'Sucursal 2', address: null, phone: null, businessId: 'biz-1', createdById: 'user-1',
    });

    const res = await request(app)
      .post('/api/v1/business/branches')
      .set(authHeader('ADMIN'))
      .send({ name: 'Sucursal 2' });

    expect(res.status).toBe(201);
    expect(mockPrisma.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ name: 'Sucursal 2', businessId: 'biz-1', createdById: 'user-1' }) }),
    );
  });

  it('retorna 403 cuando el plan Pro ya alcanzó el límite de 3 sucursales', async () => {
    mockBusinessWithPlan('pro', 3);
    const res = await request(app)
      .post('/api/v1/business/branches')
      .set(authHeader('ADMIN'))
      .send({ name: 'Sucursal 4' });

    expect(res.status).toBe(403);
    expect(mockPrisma.branch.create).not.toHaveBeenCalled();
  });

  it('retorna 403 cuando el plan Free ya alcanzó el límite de 1 sucursal', async () => {
    mockBusinessWithPlan('free', 1);
    const res = await request(app)
      .post('/api/v1/business/branches')
      .set(authHeader('ADMIN'))
      .send({ name: 'Sucursal 2' });

    expect(res.status).toBe(403);
    expect(mockPrisma.branch.create).not.toHaveBeenCalled();
  });
});

describe('PUT /api/v1/business/branches/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 404 si la sucursal no pertenece al negocio del usuario', async () => {
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .put('/api/v1/business/branches/branch-x')
      .set(authHeader('ADMIN'))
      .send({ name: 'Nuevo nombre' });
    expect(res.status).toBe(404);
  });

  it('actualiza la sucursal cuando pertenece al negocio', async () => {
    (mockPrisma.branch.findFirst as jest.Mock).mockResolvedValue({ id: 'branch-1', businessId: 'biz-1' });
    (mockPrisma.branch.update as jest.Mock).mockResolvedValue({ id: 'branch-1', name: 'Nuevo nombre' });

    const res = await request(app)
      .put('/api/v1/business/branches/branch-1')
      .set(authHeader('ADMIN'))
      .send({ name: 'Nuevo nombre' });

    expect(res.status).toBe(200);
    expect(mockPrisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'branch-1' } }),
    );
  });
});
