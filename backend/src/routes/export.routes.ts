import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { exportController } from '../controllers/export.controller';
import { authenticate } from '../middlewares/auth';
import { planLimit } from '../middlewares/planLimit';

const router = Router();
router.use(authenticate);
router.use(planLimit.exports());

// Exports generate heavy Excel/PDF files — limit to 10 per 15 min per user
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1_000 : 10,
  keyGenerator: (req: any) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas exportaciones. Espere 15 minutos antes de volver a exportar.' },
});
router.use(exportLimiter);

router.get('/sales', exportController.exportSales);
router.get('/purchases', exportController.exportPurchases);
router.get('/expenses', exportController.exportExpenses);
router.get('/financial', exportController.exportFinancialReport);

export default router;
