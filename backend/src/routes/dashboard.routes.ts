import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticate } from '../middlewares/auth';
import { planLimit } from '../middlewares/planLimit';

const router = Router();
router.use(authenticate);

router.get('/summary', dashboardController.getSummary);
router.get('/sales-chart', dashboardController.getSalesChart);
router.get('/ai-summary', planLimit.aiInsights(), dashboardController.getAiSummary);

export default router;
