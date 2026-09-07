import { Router } from 'express';
import { body } from 'express-validator';
import { creditController } from '../controllers/credit.controller';
import { creditImportController } from '../controllers/creditImport.controller';
import { authenticate } from '../middlewares/auth';
import { requirePermission } from '../middlewares/permissions';
import { validate } from '../middlewares/validate';
import { AppError } from '../utils/response';
import { planLimit } from '../middlewares/planLimit';
import multer from 'multer';

const router = Router();
router.use(authenticate);

const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const permitidos = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/csv',
    ];
    if (!permitidos.includes(file.mimetype)) {
      return cb(new AppError('Solo se permiten archivos Excel (.xlsx, .xls) o CSV', 400));
    }
    cb(null, true);
  },
});

// Cargar de una los fiados que el negocio ya tenía apuntados. Va ANTES de
// '/:id' para que no lo capture esa ruta.
router.get('/import-template', requirePermission('creditos.ver'), creditImportController.template);
router.post('/import',
  requirePermission('creditos.gestionar'),
  planLimit.bulkImport(),
  xlsxUpload.single('file'),
  creditImportController.importar,
);

router.get('/', requirePermission('creditos.ver'), creditController.list);
router.get('/:id', requirePermission('creditos.ver'), creditController.getOne);
router.post('/',
  requirePermission('creditos.ver'),
  planLimit.credits(),
  [body('totalAmount').isFloat({ min: 0.01 }).withMessage('El monto del crédito debe ser mayor a 0')],
  validate,
  creditController.create,
);
router.post('/:id/payments',
  requirePermission('creditos.gestionar'),
  [
    body('amount').isFloat({ min: 0.01 }).withMessage('Monto inválido'),
    body('paymentMethod').optional().isIn(['CASH', 'TRANSFER', 'NEQUI', 'DAVIPLATA', 'CARD']),
    body('paymentAccountId').optional({ nullable: true }).isString(),
    // A qué cuota se aplica el abono. Lo elige el cliente al pagar.
    body('installmentId').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('Cuota inválida'),
  ],
  validate,
  creditController.addPayment,
);

// Cambiar la fecha de pago. La puede tocar quien atiende (CASHIER), porque
// acordar un plazo nuevo con el cliente es parte del mostrador, no una decisión
// administrativa: no mueve plata, solo la fecha.
router.patch('/:id/due-date',
  requirePermission('creditos.gestionar'),
  [body('dueDate').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Fecha inválida')],
  validate,
  creditController.updateDueDate,
);

// Anular un crédito manual (registrado con el cliente o monto equivocado) —
// requiere ADMIN/SUPERVISOR, igual que anular una venta.
router.patch('/:id/cancel', requirePermission('creditos.anular'), creditController.cancel);

export default router;
