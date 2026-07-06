import { Router } from 'express';
import { body } from 'express-validator';
import { expenseController } from '../controllers/expense.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

router.get('/categories', expenseController.listCategories);
router.post('/categories',
  authorize('ADMIN', 'SUPERVISOR'),
  [body('name').trim().notEmpty().withMessage('El nombre de la categoría es requerido')],
  validate,
  expenseController.createCategory,
);
router.get('/summary/monthly', expenseController.getMonthlySummary);
router.get('/', expenseController.list);
router.post('/',
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('description').trim().notEmpty().withMessage('La descripción es requerida'),
    body('amount').isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a 0'),
    body('date').optional().isISO8601().withMessage('Fecha inválida'),
    body('categoryId').optional({ checkFalsy: true }).isUUID().withMessage('Categoría inválida'),
    body('notes').optional().trim(),
    body('paymentMethod').optional().trim(),
  ],
  validate,
  expenseController.create,
);
router.put('/:id',
  authorize('ADMIN', 'SUPERVISOR'),
  [
    body('description').optional().trim().notEmpty().withMessage('La descripción no puede estar vacía'),
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a 0'),
    body('date').optional().isISO8601().withMessage('Fecha inválida'),
    body('categoryId').optional({ checkFalsy: true }).isUUID().withMessage('Categoría inválida'),
  ],
  validate,
  expenseController.update,
);
router.delete('/:id', authorize('ADMIN'), expenseController.delete);

export default router;
