import { Router } from 'express';
import { body } from 'express-validator';
import { paymentController } from '../controllers/payment.controller';
import { authenticate } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const router = Router();

// POST /api/v1/payments/create-link  — authenticated, creates a Wompi payment link
router.post(
  '/create-link',
  authenticate,
  [body('period').optional().isIn(['monthly', 'quarterly', 'annual']).withMessage('Período inválido')],
  validate,
  paymentController.createLink,
);

// POST /api/v1/payments/webhook  — called by Wompi (no auth, signature verified in controller)
router.post('/webhook', paymentController.webhook);

export default router;