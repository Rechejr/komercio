import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
import { success, created, AppError } from '../utils/response';

const router = Router();
router.use(authenticate);

router.get('/current', authorize('ADMIN', 'SUPERVISOR', 'CASHIER'), async (req: any, res, next) => {
  try {
    if (!req.user.branchId) return next(new AppError('No tienes una sucursal asignada', 403));
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
    const expectedAmount = Number(register.openingAmount) + totalIn - totalOut;

    return success(res, { ...register, totalIn, totalOut, expectedAmount });
  } catch (err) { next(err); }
});

router.post('/open', authorize('ADMIN', 'SUPERVISOR', 'CASHIER'), async (req: any, res, next) => {
  try {
    if (!req.user.branchId) return next(new AppError('No tienes una sucursal asignada', 403));
    const existing = await prisma.cashRegister.findFirst({
      where: { branchId: req.user.branchId, status: 'OPEN' },
    });
    if (existing) throw new AppError('Ya hay una caja abierta', 400);

    const openingAmount = parseFloat(req.body.openingAmount);
    if (isNaN(openingAmount) || openingAmount < 0) {
      throw new AppError('El monto de apertura debe ser un número mayor o igual a 0', 400);
    }

    const register = await prisma.cashRegister.create({
      data: {
        branchId: req.user.branchId,
        openedBy: req.user.userId,
        openingAmount,
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
    // CRIT-06: verifica que la caja pertenezca a la sucursal del usuario autenticado
    if (register.branchId !== req.user.branchId) throw new AppError('No tienes acceso a esta caja', 403);

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

    const closingAmount = parseFloat(req.body.closingAmount);
    if (isNaN(closingAmount) || closingAmount < 0) {
      throw new AppError('El monto de cierre debe ser un número mayor o igual a 0', 400);
    }

    const totalIn = Number(inAgg._sum.amount || 0);
    const totalOut = Number(outAgg._sum.amount || 0);
    const expectedAmount = Number(register.openingAmount) + totalIn - totalOut;
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

router.post('/:id/movement', authorize('ADMIN', 'SUPERVISOR', 'CASHIER'), async (req: any, res, next) => {
  try {
    const register = await prisma.cashRegister.findUnique({ where: { id: req.params.id } });
    if (!register) throw new AppError('Caja no encontrada', 404);
    if (register.branchId !== req.user.branchId) throw new AppError('No tienes acceso a esta caja', 403);
    if (register.status !== 'OPEN') throw new AppError('La caja no está abierta', 400);

    if (!['IN', 'OUT'].includes(req.body.type)) {
      throw new AppError('Tipo de movimiento inválido', 400);
    }

    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new AppError('El monto debe ser un número mayor a 0', 400);
    }

    if (!req.body.description?.trim()) {
      throw new AppError('La descripción es requerida', 400);
    }

    const movement = await prisma.cashMovement.create({
      data: {
        cashRegisterId: req.params.id,
        type: req.body.type,
        amount,
        description: req.body.description,
      },
    });
    return created(res, movement, 'Movimiento registrado');
  } catch (err) { next(err); }
});

export default router;
