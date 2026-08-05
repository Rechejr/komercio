import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { quoteController } from '../controllers/quote.controller';

const router = Router();
router.use(authenticate);

const VENDER = authorize('ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER');

router.get('/', VENDER, quoteController.list);
router.get('/:id', VENDER, quoteController.getOne);
router.post('/', VENDER, quoteController.create);
router.patch('/:id/converted', VENDER, quoteController.markConverted);
router.delete('/:id', authorize('ADMIN', 'SUPERVISOR'), quoteController.remove);

export default router;
