import { Router } from 'express';
import { reportController } from '../controllers/report.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN', 'SUPERVISOR'));

router.get('/sales', reportController.salesReport);
router.get('/top-products', reportController.topProducts);
router.get('/top-customers', reportController.topCustomers);
router.get('/profit', reportController.profitReport);

export default router;
