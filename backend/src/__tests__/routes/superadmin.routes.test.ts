import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../app';
import { prisma } from '../../config/database';
import * as jwtUtils from '../../utils/jwt';

jest.mock('../../config/database', () => ({
  prisma: {
    business: { findUnique: jest.fn(), delete: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
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

function authHeader() {
  mockJwt.verifyAccessToken.mockReturnValue({
    userId: 'super-1', email: 'super@test.com', role: 'SUPER_ADMIN', businessId: null, branchId: null,
  } as any);
  return { Authorization: 'Bearer valid-token' };
}

describe('DELETE /api/v1/superadmin/businesses/:id', () => {
  beforeEach(() => jest.clearAllMocks());

  it('borra las transferencias entre bodegas, el stock por bodega y los payment links antes de productos/sucursales/negocio (FKs RESTRICT que antes faltaban)', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ password: 'hashed' });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    (mockPrisma.business.findUnique as jest.Mock).mockResolvedValue({
      id: 'biz-1', name: 'Negocio de prueba', ownerId: 'owner-1',
      branches: [{ id: 'br-1' }],
    });
    (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'staff-1' }]);

    const tx = {
      creditPayment: { deleteMany: jest.fn().mockResolvedValue({}) },
      credit: { deleteMany: jest.fn().mockResolvedValue({}) },
      cashMovement: { deleteMany: jest.fn().mockResolvedValue({}) },
      cashRegister: { deleteMany: jest.fn().mockResolvedValue({}) },
      saleNumberCounter: { deleteMany: jest.fn().mockResolvedValue({}) },
      inventoryMovement: { deleteMany: jest.fn().mockResolvedValue({}) },
      saleDetail: { deleteMany: jest.fn().mockResolvedValue({}) },
      sale: { deleteMany: jest.fn().mockResolvedValue({}) },
      purchaseDetail: { deleteMany: jest.fn().mockResolvedValue({}) },
      purchase: { deleteMany: jest.fn().mockResolvedValue({}) },
      stockTransfer: { deleteMany: jest.fn().mockResolvedValue({}) },
      productStock: { deleteMany: jest.fn().mockResolvedValue({}) },
      product: { deleteMany: jest.fn().mockResolvedValue({}) },
      expense: { deleteMany: jest.fn().mockResolvedValue({}) },
      expenseCategory: { deleteMany: jest.fn().mockResolvedValue({}) },
      customer: { deleteMany: jest.fn().mockResolvedValue({}) },
      supplier: { deleteMany: jest.fn().mockResolvedValue({}) },
      category: { deleteMany: jest.fn().mockResolvedValue({}) },
      brand: { deleteMany: jest.fn().mockResolvedValue({}) },
      auditLog: { updateMany: jest.fn().mockResolvedValue({}) },
      user: { deleteMany: jest.fn().mockResolvedValue({}), delete: jest.fn().mockResolvedValue({}) },
      branch: { deleteMany: jest.fn().mockResolvedValue({}) },
      paymentLink: { deleteMany: jest.fn().mockResolvedValue({}) },
      business: { delete: jest.fn().mockResolvedValue({}) },
    };
    (mockPrisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => fn(tx));

    const res = await request(app)
      .delete('/api/v1/superadmin/businesses/biz-1')
      .set(authHeader())
      .send({ password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(tx.stockTransfer.deleteMany).toHaveBeenCalledWith({ where: { businessId: 'biz-1' } });
    expect(tx.productStock.deleteMany).toHaveBeenCalledWith({ where: { product: { businessId: 'biz-1' } } });
    expect(tx.paymentLink.deleteMany).toHaveBeenCalledWith({ where: { businessId: 'biz-1' } });

    // Orden: transferencias/stock por bodega ANTES de borrar productos (FK RESTRICT).
    const stockTransferOrder = (tx.stockTransfer.deleteMany as jest.Mock).mock.invocationCallOrder[0];
    const productStockOrder = (tx.productStock.deleteMany as jest.Mock).mock.invocationCallOrder[0];
    const productOrder = (tx.product.deleteMany as jest.Mock).mock.invocationCallOrder[0];
    expect(stockTransferOrder).toBeLessThan(productOrder);
    expect(productStockOrder).toBeLessThan(productOrder);

    // paymentLink ANTES de borrar el negocio (FK RESTRICT hacia businesses).
    const paymentLinkOrder = (tx.paymentLink.deleteMany as jest.Mock).mock.invocationCallOrder[0];
    const businessDeleteOrder = (tx.business.delete as jest.Mock).mock.invocationCallOrder[0];
    expect(paymentLinkOrder).toBeLessThan(businessDeleteOrder);
  });

  it('rechaza con 401 si la contraseña es incorrecta', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ password: 'hashed' });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

    const res = await request(app)
      .delete('/api/v1/superadmin/businesses/biz-1')
      .set(authHeader())
      .send({ password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});
