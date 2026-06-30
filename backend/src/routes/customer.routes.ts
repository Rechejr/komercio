import { Router } from 'express';
import { customerController } from '../controllers/customer.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { planLimit } from '../middlewares/planLimit';

const router = Router();
router.use(authenticate);

router.get('/', customerController.list);
router.get('/:id', customerController.getOne);
router.get('/:id/purchases', customerController.getPurchaseHistory);
router.post('/', authorize('ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'), planLimit.customers(), customerController.create);
router.put('/:id', authorize('ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER'), customerController.update);
router.delete('/:id', authorize('ADMIN', 'SUPERVISOR'), customerController.delete);

export default router;
