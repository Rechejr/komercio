import request from 'supertest';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

jest.mock('../../config/database', () => ({
  prisma: {
    cashRegister: { findUnique: jest.fn() },
    cashMovement: { create: jest.fn() },
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
    userId: 'user-1', email: 'cajero@test.com', role, businessId: 'biz-1', branchId: 'branch-1',
  } as any);
  return { Authorization: 'Bearer valid-token' };
}

describe('POST /api/v1/cash-register/:id/movement', () => {
  beforeEach(() => jest.clearAllMocks());

  it('guarda quién registró el movimiento (createdById), sin importar el rol', async () => {
    (mockPrisma.cashRegister.findUnique as jest.Mock).mockResolvedValue({
      id: 'reg-1', branchId: 'branch-1', status: 'OPEN',
    });
    (mockPrisma.cashMovement.create as jest.Mock).mockResolvedValue({ id: 'mov-1' });

    const res = await request(app)
      .post('/api/v1/cash-register/reg-1/movement')
      .set(authHeader('CASHIER'))
      .send({ type: 'IN', amount: 20000, description: 'Préstamo' });

    expect(res.status).toBe(201);
    expect(mockPrisma.cashMovement.create).toHaveBeenCalledWith({
      data: {
        cashRegisterId: 'reg-1',
        type: 'IN',
        amount: 20000,
        description: 'Préstamo',
        createdById: 'user-1',
      },
    });
  });
});
