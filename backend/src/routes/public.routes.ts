import { Router } from 'express';
import { prisma } from '../config/database';

const router = Router();

// GET /api/v1/public/catalogo/:businessId
// Catálogo público — sin autenticación, solo campos seguros (no costPrice)
router.get('/catalogo/:businessId', async (req, res, next) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, logo: true, city: true, phone: true, address: true, category: true },
    });
    if (!business) {
      res.status(404).json({ success: false, error: 'Negocio no encontrado' });
      return;
    }

    const products = await prisma.product.findMany({
      where: { businessId, isActive: true, deletedAt: null },
      select: {
        id: true, name: true, description: true,
        salePrice: true, unit: true,
        stock: true, image: true,
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    res.json({ success: true, data: { business, products } });
  } catch (err) { next(err); }
});

export default router;
