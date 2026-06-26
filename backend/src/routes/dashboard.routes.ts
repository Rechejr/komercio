import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();
router.use(authenticate);

router.get('/summary', dashboardController.getSummary);
router.get('/sales-chart', dashboardController.getSalesChart);

export default router;
