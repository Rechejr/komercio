import { Router } from 'express';
import { body } from 'express-validator';
import { expenseController } from '../controllers/expense.controller';
import { authenticate } from '../middlewares/auth';
import { requirePermission } from '../middlewares/permissions';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

router.get('/categories', requirePermission('gastos.ver'), expenseController.listCategories);
router.post('/categories',
  requirePermission('gastos.ver'),
  [body('name').trim().notEmpty().withMessage('El nombre de la categoría es requerido')],
  validate,
  expenseController.createCategory,
);
router.delete('/categories/:id', requirePermission('gastos.eliminar'), expenseController.deleteCategory);
router.get('/summary/monthly', requirePermission('gastos.ver'), expenseController.getMonthlySummary);
router.get('/', requirePermission('gastos.ver'), expenseController.list);
router.post('/',
  requirePermission('gastos.gestionar'),
  [
    body('description').trim().notEmpty().withMessage('La descripción es requerida'),
    body('amount').isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a 0'),
    body('date').optional().isISO8601().withMessage('Fecha inválida'),
    body('categoryId').optional({ checkFalsy: true }).isUUID().withMessage('Categoría inválida'),
    body('notes').optional().trim(),
    body('paymentMethod').optional().trim(),
    body('paymentAccountId').optional({ nullable: true }).isString(),
  ],
  validate,
  expenseController.create,
);
router.put('/:id',
  requirePermission('gastos.gestionar'),
  [
    body('description').optional().trim().notEmpty().withMessage('La descripción no puede estar vacía'),
    body('amount').optional().isFloat({ min: 0.01 }).withMessage('El monto debe ser mayor a 0'),
    body('date').optional().isISO8601().withMessage('Fecha inválida'),
    body('categoryId').optional({ checkFalsy: true }).isUUID().withMessage('Categoría inválida'),
  ],
  validate,
  expenseController.update,
);
router.delete('/:id', requirePermission('gastos.eliminar'), expenseController.delete);

export default router;
