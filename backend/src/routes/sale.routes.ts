import { Router } from 'express';
import { body } from 'express-validator';
import { saleController } from '../controllers/sale.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { planLimit } from '../middlewares/planLimit';

const router = Router();
router.use(authenticate);

router.get('/', saleController.list);
router.get('/summary/daily', saleController.getDailySummary);
router.get('/:id', saleController.getOne);

router.post('/',
  planLimit.salesPerMonth(),
  planLimit.saleCredit(),
  [
    body('items').isArray({ min: 1 }).withMessage('Se requiere al menos un producto'),
    body('items.*.productId').isUUID().withMessage('productId inválido'),
    body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Cantidad debe ser mayor a 0'),
    body('items.*.discountPct').optional().isFloat({ min: 0, max: 100 }).withMessage('Descuento por ítem debe estar entre 0 y 100'),
    body('discountAmount').optional().isFloat({ min: 0 }).withMessage('El descuento no puede ser negativo'),
    body('paidAmount').optional().isFloat({ min: 0 }).withMessage('El monto pagado no puede ser negativo'),
    body('paymentMethod').optional().isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD', 'MIXED']).withMessage('Método de pago inválido'),
    body('customerId').optional({ checkFalsy: true }).isUUID().withMessage('customerId inválido'),
    body('branchId').optional({ checkFalsy: true }).isUUID().withMessage('branchId inválido'),
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
