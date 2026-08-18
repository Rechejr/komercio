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

// POST /api/v1/payments/checkout — PÚBLICO: comprar sin tener cuenta. El cliente
// deja cuatro datos, paga, y el webhook le crea la cuenta y le manda las claves.
// Sin authenticate a propósito; el rate limit se aplica en app.ts.
router.post(
  '/checkout',
  [
    body('productType').optional().isIn(['pos', 'contable']).withMessage('Producto inválido'),
    body('period').optional().isIn(['monthly', 'quarterly', 'annual']).withMessage('Período inválido'),
    body('name').trim().notEmpty().withMessage('Escribe tu nombre'),
    body('lastName').trim().notEmpty().withMessage('Escribe tus apellidos'),
    body('document').trim().notEmpty().withMessage('Escribe tu número de cédula'),
    body('email').isEmail().normalizeEmail().withMessage('Escribe un correo válido'),
    body('sellerSlug').optional({ nullable: true }).trim(),
  ],
  validate,
  paymentController.checkoutInvitado,
);

// POST /api/v1/payments/webhook  — called by Wompi (no auth, signature verified in controller)
router.post('/webhook', paymentController.webhook);

export default router;