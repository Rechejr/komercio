import { Router } from 'express';
import { searchController } from '../controllers/search.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();
router.use(authenticate);
router.get('/', searchController.search);

export default router;
