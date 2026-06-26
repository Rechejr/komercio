import { Router } from 'express';
import { body } from 'express-validator';
import { productController } from '../controllers/product.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

router.get('/', productController.list);
router.get('/low-stock', productController.getLowStock);
router.get('/:id', productController.getOne);

router.post('/',
  authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'),
  [
    body('code').trim().notEmpty().withMessage('El código es requerido'),
    body('name').trim().notEmpty().withMessage('El nombre es requerido'),
    body('salePrice').isFloat({ min: 0 }).withMessage('Precio de venta inválido'),
    body('costPrice').optional().isFloat({ min: 0 }),
  ],
  validate,
  productController.create,
);

router.put('/:id', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'), productController.update);
router.delete('/:id', authorize('ADMIN', 'SUPERVISOR'), productController.delete);
router.post('/:id/duplicate', authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'), productController.duplicate);
router.patch('/:id/adjust-stock',
  authorize('ADMIN', 'SUPERVISOR', 'WAREHOUSE'),
  [
    body('quantity').isFloat({ min: 0.001 }),
    body('type').isIn(['IN', 'OUT', 'ADJUSTMENT']),
    body('reason').optional().trim(),
  ],
  validate,
  productController.adjustStock,
);

export default router;
