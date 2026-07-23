import { Router } from 'express';
import { dashboardController } from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { planLimit } from '../middlewares/planLimit';

const router = Router();
router.use(authenticate);

// /summary y /sales-chart quedan abiertos a todos los roles a propósito: solo
// devuelven ventas, conteos de inventario y saldos de cartera — ingresos, nunca
// costo ni margen. Son la pantalla de inicio de cualquier usuario, y
// restringirlos dejaría a cajeros y vendedores sin dashboard.
router.get('/summary', dashboardController.getSummary);
router.get('/sales-chart', dashboardController.getSalesChart);

// El resumen con IA sí es una herramienta de gestión: interpreta rentabilidad
// por producto y riesgo de cartera. Se limita a los mismos roles que ven
// reportes. El frontend oculta la tarjeta para los demás roles, así que este
// 403 no debería llegar a verse.
router.get(
  '/ai-summary',
  authorize('ADMIN', 'SUPERVISOR'),
  planLimit.aiInsights(),
  dashboardController.getAiSummary,
);

export default router;
