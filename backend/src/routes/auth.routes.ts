import { Router } from 'express';
import { body } from 'express-validator';
import { rateLimit } from 'express-rate-limit';
import { authController } from '../controllers/auth.controller';
import { authenticate, authorize, requireCsrfHeader } from '../middlewares/auth';
import { validate } from '../middlewares/validate';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1_000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Demasiados intentos de inicio de sesión. Intente de nuevo en 15 minutos.' },
});

const router = Router();

router.post('/register',
  [
    body('name').trim().notEmpty().withMessage('El nombre es requerido'),
    body('email').isEmail().normalizeEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
    body('businessName').optional().trim().notEmpty(),
  ],
  validate,
  authController.register,
);

router.post('/login',
  loginLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  authController.login,
);

router.post('/google',
  [body('accessToken').notEmpty().withMessage('Token de Google requerido')],
  validate,
  authController.googleAuth,
);

router.post('/refresh-token', requireCsrfHeader, authController.refreshToken);
router.post('/logout', requireCsrfHeader, authController.logout);

router.post('/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  validate,
  authController.forgotPassword,
);

router.post('/reset-password',
  [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }),
  ],
  validate,
  authController.resetPassword,
);

router.get('/verify-email/:token', authController.verifyEmail);

router.post('/resend-verification',
  [body('email').isEmail().normalizeEmail()],
  validate,
  authController.resendVerification,
);

router.get('/me', authenticate, authController.me);

// Cambiar de cuenta (POS ↔ Contable) del mismo correo. Auth por Bearer token, así
// que no necesita el header anti-CSRF (un atacante no puede forjar el Bearer).
router.post('/switch-business',
  authenticate,
  [body('businessId').notEmpty()],
  validate,
  authController.switchBusiness,
);

// Activar el otro producto bajo el mismo login (solo el dueño).
router.post('/activar-producto',
  authenticate,
  authorize('ADMIN', 'SUPER_ADMIN'),
  [
    body('businessName').trim().notEmpty().withMessage('El nombre del negocio es requerido'),
    body('businessType').optional().isIn(['pos', 'contable']),
  ],
  validate,
  authController.activarProducto,
);

router.patch('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  validate,
  authController.changePassword,
);

export default router;
