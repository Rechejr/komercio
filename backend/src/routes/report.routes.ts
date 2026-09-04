import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { reportController } from '../controllers/report.controller';
import { authenticate } from '../middlewares/auth';
import { requirePermission } from '../middlewares/permissions';

const router = Router();
router.use(authenticate);

// Reports run heavy aggregation queries — limit to 30 per 5 min per user
const reportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1_000 : 30,
  keyGenerator: (req: any) => req.user?.userId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas de reportes. Espere 5 minutos.' },
});
router.use(reportLimiter);

router.get('/sales', requirePermission('reportes.ver'), reportController.salesReport);
router.get('/top-products', requirePermission('reportes.ver'), reportController.topProducts);
router.get('/top-customers', requirePermission('reportes.ver'), reportController.topCustomers);
// La utilidad expone costos y margen: va aparte de los demas reportes.
router.get('/profit', requirePermission('reportes.financiero'), reportController.profitReport);

export default router;
