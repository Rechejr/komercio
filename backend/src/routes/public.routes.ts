import { Router } from 'express';
import { prisma } from '../config/database';

const router = Router();

// GET /api/v1/public/catalogo/:businessId
// Catálogo público — sin autenticación, solo campos seguros (no costPrice)
router.get('/catalogo/:businessId', async (req, res, next) => {
  try {
    const { businessId } = req.params;

    const business = await prisma.business.findUnique({
      // deletedAt excluido: un negocio desactivado por el superadmin (borrado
      // suave) no debe seguir mostrando su catálogo público indefinidamente.
      where: { id: businessId, deletedAt: null },
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

    // La pantalla pública solo necesita "disponible/agotado" — mandar el stock
    // exacto le regala a cualquiera que mire la red una forma de ir midiendo el
    // inventario real del negocio a lo largo del tiempo.
    const publicProducts = products.map(({ stock, ...p }) => ({ ...p, inStock: stock > 0 }));

    res.json({ success: true, data: { business, products: publicProducts } });
  } catch (err) { next(err); }
});

export default router;
