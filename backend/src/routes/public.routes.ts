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
      select: { id: true, name: true, logo: true, city: true, phone: true, address: true, category: true, catalogPaymentLink: true, catalogPaymentQr: true },
    });
    if (!business) {
      res.status(404).json({ success: false, error: 'Negocio no encontrado' });
      return;
    }

    const products = await prisma.product.findMany({
      where: { businessId, isActive: true, deletedAt: null },
      select: {
        id: true, name: true, code: true, description: true,
        salePrice: true, unit: true,
        stock: true, image: true, images: true, hasVariants: true,
        category: { select: { id: true, name: true } },
        // Variantes (ropa) para que el catálogo deje elegir talla/color al pedir.
        variants: {
          where: { active: true },
          select: { id: true, talla: true, color: true, stocks: { select: { stock: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
    });

    // La pantalla pública solo necesita "disponible/agotado" — mandar el stock
    // exacto le regala a cualquiera que mire la red una forma de ir midiendo el
    // inventario real del negocio a lo largo del tiempo. Igual para las variantes.
    const publicProducts = products.map(({ stock, variants, ...p }) => ({
      ...p,
      inStock: stock > 0,
      variants: p.hasVariants
        ? variants.map((v) => ({
            id: v.id,
            talla: v.talla,
            color: v.color,
            inStock: v.stocks.reduce((s, x) => s + Number(x.stock), 0) > 0,
          }))
        : [],
    }));

    res.json({ success: true, data: { business, products: publicProducts } });
  } catch (err) { next(err); }
});

// GET /api/v1/public/producto/:productId
// Ficha pública de UN producto — alimenta la mini-página compartible (/p/:id)
// que WhatsApp lee para armar la tarjeta de vista previa (OpenGraph). Mismos
// campos seguros que el catálogo (sin costPrice ni stock exacto).
router.get('/producto/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;

    const product = await prisma.product.findFirst({
      where: { id: productId, isActive: true, deletedAt: null },
      select: {
        id: true, name: true, code: true, description: true,
        salePrice: true, unit: true, stock: true, image: true, images: true, hasVariants: true,
        category: { select: { id: true, name: true } },
        business: {
          // Solo negocios activos: si el superadmin lo desactivó, la ficha muere con él.
          select: { id: true, name: true, logo: true, city: true, phone: true, deletedAt: true },
        },
        variants: {
          where: { active: true },
          select: { id: true, talla: true, color: true, stocks: { select: { stock: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!product || product.business.deletedAt) {
      res.status(404).json({ success: false, error: 'Producto no encontrado' });
      return;
    }

    const { stock, variants, business, ...p } = product;
    const { deletedAt, ...safeBusiness } = business;
    res.json({
      success: true,
      data: {
        business: safeBusiness,
        product: {
          ...p,
          inStock: stock > 0,
          variants: p.hasVariants
            ? variants.map((v) => ({
                id: v.id, talla: v.talla, color: v.color,
                inStock: v.stocks.reduce((s, x) => s + Number(x.stock), 0) > 0,
              }))
            : [],
        },
      },
    });
  } catch (err) { next(err); }
});

export default router;
