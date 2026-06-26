import { Router } from 'express';
import { body } from 'express-validator';
import { saleController } from '../controllers/sale.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

router.get('/', saleController.list);
router.get('/summary/daily', saleController.getDailySummary);
router.get('/:id', saleController.getOne);

router.post('/',
  [
    body('items').isArray({ min: 1 }).withMessage('Se requiere al menos un producto'),
    body('items.*.productId').notEmpty(),
    body('items.*.quantity').isFloat({ min: 0.001 }),
    body('branchId').optional().isUUID(),
  ],
  validate,
  saleController.create,
);

router.patch('/:id/cancel',
  authorize('ADMIN', 'SUPERVISOR'),
  [body('reason').optional().trim()],
  validate,
  saleController.cancel,
);

router.delete('/:id',
  authorize('ADMIN'),
  saleController.permanentDelete,
);

export default router;
