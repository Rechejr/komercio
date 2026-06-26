import { Router } from 'express';
import { exportController } from '../controllers/export.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();
router.use(authenticate);

router.get('/sales', exportController.exportSales);
router.get('/purchases', exportController.exportPurchases);
router.get('/expenses', exportController.exportExpenses);

export default router;
