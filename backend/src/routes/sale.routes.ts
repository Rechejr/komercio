import { Router } from 'express';
import { body } from 'express-validator';
import { saleController } from '../controllers/sale.controller';
import { authenticate } from '../middlewares/auth';
import { requirePermission } from '../middlewares/permissions';
import { validate } from '../middlewares/validate';
import { planLimit } from '../middlewares/planLimit';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('ventas.ver'), saleController.list);
router.get('/summary/daily', requirePermission('ventas.ver'), saleController.getDailySummary);
// Historial de devoluciones (va antes de '/:id' para que no lo capture).
router.get('/returns/list', requirePermission('ventas.ver'), saleController.listReturns);
router.get('/:id', requirePermission('ventas.ver'), saleController.getOne);

router.post('/', requirePermission('ventas.crear'),
  planLimit.salesPerMonth(),
  planLimit.saleCredit(),
  [
    body('items').isArray({ min: 1 }).withMessage('Se requiere al menos un producto'),
    body('items.*.productId').isUUID().withMessage('productId inválido'),
    body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('Cantidad debe ser mayor a 0'),
    body('items.*.productVariantId').optional({ checkFalsy: true }).isUUID().withMessage('productVariantId inválido'),
    body('items.*.discountPct').optional({ checkFalsy: true }).isFloat({ min: 0, max: 100 }).withMessage('Descuento por ítem debe estar entre 0 y 100'),
    body('discountAmount').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('El descuento no puede ser negativo'),
    body('paidAmount').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('El monto pagado no puede ser negativo'),
    body('paymentMethod').optional().isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD', 'MIXED']).withMessage('Método de pago inválido'),
    body('paymentAccountId').optional({ nullable: true }).isString(),
    body('customerId').optional({ checkFalsy: true }).isUUID().withMessage('customerId inválido'),
    // Fecha en que se compromete a pagar el fiado. Sin ella, el fiado nunca
    // entra en mora ni genera avisos: es lo que hace que el resto del sistema
    // (el aviso 3 días antes y el estado "En mora") funcione de verdad.
    body('creditDueDate').optional({ checkFalsy: true }).isISO8601().withMessage('Fecha de vencimiento inválida'),
    // Venta a cuotas. El tope evita generar cientos de filas por un dedazo.
    body('creditInstallments').optional({ checkFalsy: true }).isInt({ min: 2, max: 36 }).withMessage('Las cuotas deben ser entre 2 y 36'),
    body('creditInterestRate').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('El interés debe estar entre 0 y 100'),
    body('creditFirstDueDate').optional({ checkFalsy: true }).isISO8601().withMessage('Fecha de la primera cuota inválida'),
    body('creditInstallmentAmounts').optional({ checkFalsy: true }).isArray({ max: 36 }).withMessage('Montos de cuotas inválidos'),
    body('branchId').optional({ checkFalsy: true }).isUUID().withMessage('branchId inválido'),
  ],
  validate,
  saleController.create,
);

router.patch('/:id/cancel',
  requirePermission('ventas.anular'),
  [body('reason').optional().trim()],
  validate,
  saleController.cancel,
);

// Devolución / nota crédito (total o parcial). Solo ADMIN y Supervisor.
router.post('/:id/return',
  requirePermission('ventas.anular'),
  [
    body('items').isArray({ min: 1 }).withMessage('Selecciona al menos un producto para devolver'),
    body('items.*.saleDetailId').isUUID().withMessage('saleDetailId inválido'),
    body('items.*.quantity').isFloat({ min: 0.001 }).withMessage('La cantidad debe ser mayor a 0'),
    body('restock').optional().isBoolean(),
    body('reason').optional().trim(),
  ],
  validate,
  saleController.createReturn,
);

router.delete('/:id',
  requirePermission('ventas.eliminar'),
  saleController.permanentDelete,
);

export default router;
