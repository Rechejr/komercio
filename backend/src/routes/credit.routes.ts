import { Router } from 'express';
import { body } from 'express-validator';
import { creditController } from '../controllers/credit.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

router.get('/', creditController.list);
router.get('/:id', creditController.getOne);
router.post('/', creditController.create);
router.post('/:id/payments',
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Monto inválido'),
    body('paymentMethod').isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD']),
  ],
  validate,
  creditController.addPayment,
);

export default router;
