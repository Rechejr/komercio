import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../config/database', () => ({
  prisma: {
    user: { findFirst: jest.fn(), update: jest.fn() },
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

const ADMIN_ID = 'admin-1';

function authHeader() {
  mockJwt.verifyAccessToken.mockReturnValue({
    userId: ADMIN_ID, email: 'admin@test.com', role: 'ADMIN', businessId: 'biz-1', branchId: 'branch-1',
  } as any);
  return { Authorization: 'Bearer valid-token' };
}

describe('DELETE /api/v1/users/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 si el admin intenta eliminarse a sí mismo', async () => {
    const res = await request(app)
      .delete(`/api/v1/users/${ADMIN_ID}`)
      .set(authHeader());

    expect(res.status).toBe(400);
    expect(mockPrisma.user.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('retorna 404 si el empleado no pertenece a este negocio', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await request(app)
      .delete('/api/v1/users/other-user')
      .set(authHeader());

    expect(res.status).toBe(404);
  });

  it('elimina (soft-delete) a otro empleado del mismo negocio', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'emp-1', branchId: 'branch-1' });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .delete('/api/v1/users/emp-1')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'emp-1' },
      data: { deletedAt: expect.any(Date), isActive: false },
    });
  });
});

describe('PATCH /api/v1/users/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna 400 si el admin intenta desactivarse a sí mismo', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: ADMIN_ID, branchId: 'branch-1' });

    const res = await request(app)
      .patch(`/api/v1/users/${ADMIN_ID}`)
      .set(authHeader())
      .send({ isActive: false });

    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('retorna 400 si el admin intenta quitarse el rol ADMIN a sí mismo', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: ADMIN_ID, branchId: 'branch-1' });

    const res = await request(app)
      .patch(`/api/v1/users/${ADMIN_ID}`)
      .set(authHeader())
      .send({ role: 'CASHIER' });

    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('permite al admin editar su propio nombre sin tocar rol/estado', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: ADMIN_ID, branchId: 'branch-1' });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ id: ADMIN_ID, name: 'Nuevo nombre' });

    const res = await request(app)
      .patch(`/api/v1/users/${ADMIN_ID}`)
      .set(authHeader())
      .send({ name: 'Nuevo nombre' });

    expect(res.status).toBe(200);
  });

  it('actualiza a otro empleado sin restricción', async () => {
    (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue({ id: 'emp-1', branchId: 'branch-1' });
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({ id: 'emp-1', isActive: false });

    const res = await request(app)
      .patch('/api/v1/users/emp-1')
      .set(authHeader())
      .send({ isActive: false });

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'emp-1' } }),
    );
  });
});
