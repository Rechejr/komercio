import { Router } from 'express';
import { body } from 'express-validator';
import { creditController } from '../controllers/credit.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { planLimit } from '../middlewares/planLimit';

const router = Router();
router.use(authenticate);

router.get('/', creditController.list);
router.get('/:id', creditController.getOne);
router.post('/',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER'),
  planLimit.credits(),
  [body('totalAmount').isFloat({ min: 0.01 }).withMessage('El monto del crédito debe ser mayor a 0')],
  validate,
  creditController.create,
);
router.post('/:id/payments',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER'),
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Monto inválido'),
    body('paymentMethod').optional().isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD']),
    body('paymentAccountId').optional({ nullable: true }).isString(),
  ],
  validate,
  creditController.addPayment,
);

// Cambiar la fecha de pago. La puede tocar quien atiende (CASHIER), porque
// acordar un plazo nuevo con el cliente es parte del mostrador, no una decisión
// administrativa: no mueve plata, solo la fecha.
router.patch('/:id/due-date',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER'),
  [body('dueDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Fecha inválida')],
  validate,
  creditController.updateDueDate,
);

// Anular un crédito manual (registrado con el cliente o monto equivocado) —
// requiere ADMIN/SUPERVISOR, igual que anular una venta.
router.patch('/:id/cancel', authorize('ADMIN', 'SUPERVISOR'), creditController.cancel);

export default router;
