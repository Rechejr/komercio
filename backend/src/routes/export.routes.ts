import { Router } from 'express';
import { exportController } from '../controllers/export.controller';
import { authenticate } from '../middlewares/auth';
import { planLimit } from '../middlewares/planLimit';

const router = Router();
router.use(authenticate);
router.use(planLimit.exports());

router.get('/sales', exportController.exportSales);
router.get('/purchases', exportController.exportPurchases);
router.get('/expenses', exportController.exportExpenses);

export default router;
