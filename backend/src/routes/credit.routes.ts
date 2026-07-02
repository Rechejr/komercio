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
    body('paymentMethod').isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD']),
  ],
  validate,
  creditController.addPayment,
);

export default router;
