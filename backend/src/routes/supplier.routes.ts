import { Router } from 'express';
import { supplierController } from '../controllers/supplier.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
router.use(authenticate);

router.get('/', supplierController.list);
router.get('/:id', supplierController.getOne);
router.post('/', authorize('ADMIN', 'SUPERVISOR'), supplierController.create);
router.put('/:id', authorize('ADMIN', 'SUPERVISOR'), supplierController.update);
router.delete('/:id', authorize('ADMIN'), supplierController.delete);

export default router;
