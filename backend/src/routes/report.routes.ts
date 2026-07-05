import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { reportController } from '../controllers/report.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
router.use(authenticate);
router.use(authorize('ADMIN', 'SUPERVISOR'));

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

router.get('/sales', reportController.salesReport);
router.get('/top-products', reportController.topProducts);
router.get('/top-customers', reportController.topCustomers);
router.get('/profit', reportController.profitReport);

export default router;
