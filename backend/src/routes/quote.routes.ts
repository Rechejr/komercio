import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import { requirePermission } from '../middlewares/permissions';
import { quoteController } from '../controllers/quote.controller';

const router = Router();
router.use(authenticate);


router.get('/', requirePermission('cotizaciones.gestionar'), quoteController.list);
router.get('/:id', requirePermission('cotizaciones.gestionar'), quoteController.getOne);
router.post('/', requirePermission('cotizaciones.gestionar'), quoteController.create);
router.patch('/:id/converted', requirePermission('cotizaciones.gestionar'), quoteController.markConverted);
router.delete('/:id', requirePermission('cotizaciones.gestionar'), quoteController.remove);

export default router;
