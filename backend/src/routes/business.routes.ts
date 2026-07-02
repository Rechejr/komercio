import { Router, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { prisma } from '../config/database';
import { authenticate, authorize } from '../middlewares/auth';
import { success } from '../utils/response';
import { validate } from '../middlewares/validate';

const router = Router();
router.use(authenticate);

router.get('/me', async (req: any, res, next) => {
  try {
    const businessId = req.user.businessId;
    if (!businessId) return success(res, null);
    const business = await prisma.business.findUnique({ where: { id: businessId } });
    return success(res, business);
  } catch (err) { next(err); }
});

router.put('/me',
  authorize('ADMIN'),
  [
    body('email').optional({ nullable: true }).isEmail().normalizeEmail().withMessage('Email inválido'),
    body('taxRate').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).withMessage('IVA debe estar entre 0 y 100'),
    body('name').optional().trim().notEmpty().withMessage('El nombre no puede estar vacío'),
    body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Moneda debe ser un código de 3 letras'),
  ],
  validate,
  async (req: any, res: Response, next: NextFunction) => {
  try {
    const businessId = req.user.businessId;
    if (!businessId) return success(res, null, 'No tiene negocio asociado');

    const { name, legalName, nit, phone, email, address, city, country, logo, currency, taxRate, settings } = req.body;
    const business = await prisma.business.update({
      where: { id: businessId },
      data: { name, legalName, nit, phone, email, address, city, country, logo, currency, taxRate, settings },
    });
    return success(res, business, 'Negocio actualizado');
  } catch (err) { next(err); }
});

router.get('/branches', async (req: any, res, next) => {
  try {
    const branches = await prisma.branch.findMany({
      where: { businessId: req.user.businessId, deletedAt: null },
    });
    return success(res, branches);
  } catch (err) { next(err); }
});

export default router;