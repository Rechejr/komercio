import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
import { success, created, AppError } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/current', async (req: any, res, next) => {
  try {
    const register = await prisma.cashRegister.findFirst({
      where: { branchId: req.user.branchId, status: 'OPEN' },
      include: { movements: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });

    if (!register) return success(res, null);

    // Calcular totales sobre TODOS los movimientos (no solo los 50 del display)
    const [inAgg, outAgg] = await Promise.all([
      prisma.cashMovement.aggregate({
        where: { cashRegisterId: register.id, type: 'IN' },
        _sum: { amount: true },
      }),
      prisma.cashMovement.aggregate({
        where: { cashRegisterId: register.id, type: 'OUT' },
        _sum: { amount: true },
      }),
    ]);

    const totalIn = Number(inAgg._sum.amount || 0);
    const totalOut = Number(outAgg._sum.amount || 0);
    const expectedAmount = register.openingAmount + totalIn - totalOut;

    return success(res, { ...register, totalIn, totalOut, expectedAmount });
  } catch (err) { next(err); }
});

router.post('/open', async (req: any, res, next) => {
  try {
    const existing = await prisma.cashRegister.findFirst({
      where: { branchId: req.user.branchId, status: 'OPEN' },
    });
    if (existing) throw new AppError('Ya hay una caja abierta', 400);

    const register = await prisma.cashRegister.create({
      data: {
        branchId: req.user.branchId,
        openedBy: req.user.userId,
        openingAmount: parseFloat(req.body.openingAmount) || 0,
        status: 'OPEN',
      },
    });
    return created(res, register, 'Caja abierta');
  } catch (err) { next(err); }
});

router.post('/:id/close', authorize('ADMIN', 'SUPERVISOR', 'CASHIER'), async (req: any, res, next) => {
  try {
    const register = await prisma.cashRegister.findUnique({ where: { id: req.params.id } });
    if (!register || register.status !== 'OPEN') throw new AppError('Caja no encontrada o ya cerrada', 400);

    const [inAgg, outAgg] = await Promise.all([
      prisma.cashMovement.aggregate({
        where: { cashRegisterId: req.params.id, type: 'IN' },
        _sum: { amount: true },
      }),
      prisma.cashMovement.aggregate({
        where: { cashRegisterId: req.params.id, type: 'OUT' },
        _sum: { amount: true },
      }),
    ]);

    const totalIn = Number(inAgg._sum.amount || 0);
    const totalOut = Number(outAgg._sum.amount || 0);
    const closingAmount = parseFloat(req.body.closingAmount) || 0;
    const expectedAmount = register.openingAmount + totalIn - totalOut;
    const difference = closingAmount - expectedAmount;

    const closed = await prisma.cashRegister.update({
      where: { id: req.params.id },
      data: {
        status: 'CLOSED',
        closedBy: req.user.userId,
        closingAmount,
        expectedAmount,
        difference,
        closedAt: new Date(),
        notes: req.body.notes,
      },
    });
    return success(res, closed, 'Caja cerrada');
  } catch (err) { next(err); }
});

router.post('/:id/movement', async (req: any, res, next) => {
  try {
    const movement = await prisma.cashMovement.create({
      data: {
        cashRegisterId: req.params.id,
        type: req.body.type,
        amount: parseFloat(req.body.amount),
        description: req.body.description,
      },
    });
    return created(res, movement, 'Movimiento registrado');
  } catch (err) { next(err); }
});

export default router;
