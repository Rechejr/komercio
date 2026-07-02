import { Router } from 'express';
import { body } from 'express-validator';
import { customerController } from '../controllers/customer.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { planLimit } from '../middlewares/planLimit';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

const customerBodyValidators = [
  body('name').trim().notEmpty().withMessage('El nombre es requerido'),
  body('email').optional({ nullable: true }).isEmail().normalizeEmail().withMessage('Email inválido'),
  body('phone').optional({ nullable: true }).trim(),
  body('creditLimit').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Límite de crédito inválido'),
];

router.get('/', customerController.list);
router.get('/:id', customerController.getOne);
router.get('/:id/purchases', customerController.getPurchaseHistory);
router.post('/',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'),
  planLimit.customers(),
  customerBodyValidators,
  validate,
  customerController.create,
);
router.put('/:id',
  authorize('ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'),
  [
    body('name').optional().trim().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('email').optional({ nullable: true }).isEmail().normalizeEmail().withMessage('Email inválido'),
    body('phone').optional({ nullable: true }).trim(),
    body('creditLimit').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Límite de crédito inválido'),
  ],
  validate,
  customerController.update,
);
router.delete('/:id', authorize('ADMIN', 'SUPERVISOR'), customerController.delete);

export default router;
