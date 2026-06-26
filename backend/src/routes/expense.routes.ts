import { Router } from 'express';
import { expenseController } from '../controllers/expense.controller';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();
router.use(authenticate);

router.get('/categories', expenseController.listCategories);
router.post('/categories', authorize('ADMIN', 'SUPERVISOR'), expenseController.createCategory);
router.get('/summary/monthly', expenseController.getMonthlySummary);
router.get('/', expenseController.list);
router.post('/', authorize('ADMIN', 'SUPERVISOR'), expenseController.create);
router.put('/:id', authorize('ADMIN', 'SUPERVISOR'), expenseController.update);
router.delete('/:id', authorize('ADMIN'), expenseController.delete);

export default router;
