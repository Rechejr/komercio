import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';
import { emitToBusinesss, socketEvents } from '../config/socket';

const CACHE_TTL = 300;

export const productController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const search = getSearch(req);
      const { categoryId, brandId, supplierId, lowStock, isActive } = req.query;

      const where: any = { deletedAt: null };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { code: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (categoryId) where.categoryId = categoryId;
      if (brandId) where.brandId = brandId;
      if (supplierId) where.supplierId = supplierId;
      // lowStock filter handled via getLowStock endpoint (cross-column compare requires raw SQL)
      if (isActive !== undefined) where.isActive = isActive === 'true';

      const [products, total] = await Promise.all([
        prisma.product.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            category: { select: { id: true, name: true } },
            brand: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
          },
        }),
        prisma.product.count({ where }),
      ]);

      return paginated(res, products, total, page, limit);
    } catch (err) {
      next(err);
    }
  },

  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const cacheKey = `product:${req.params.id}`;
      const cached = await cache.get(cacheKey);
      if (cached) return success(res, cached);

      const product = await prisma.product.findFirst({
        where: { id: req.params.id, deletedAt: null },
        include: {
          category: true,
          brand: true,
          supplier: { select: { id: true, name: true, phone: true } },
          inventoryMovements: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!product) throw new AppError('Producto no encontrado', 404);
      await cache.set(cacheKey, product, CACHE_TTL);
      return success(res, product);
    } catch (err) {
      next(err);
    }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = req.body;

      const product = await prisma.$transaction(async (tx) => {
        const newProduct = await tx.product.create({
          data: {
            code: data.code,
            barcode: data.barcode || null,
            name: data.name,
            description: data.description,
            categoryId: data.categoryId || null,
            brandId: data.brandId || null,
            supplierId: data.supplierId || null,
            branchId: data.branchId || null,
            costPrice: parseFloat(data.costPrice) || 0,
            salePrice: parseFloat(data.salePrice) || 0,
            wholesalePrice: data.wholesalePrice ? parseFloat(data.wholesalePrice) : null,
            stock: parseFloat(data.stock) || 0,
            minStock: parseFloat(data.minStock) || 0,
            unit: data.unit || 'unit',
            taxRate: parseFloat(data.taxRate) || 0,
            image: data.image || null,
          },
        });

        if (parseFloat(data.stock) > 0) {
          await tx.inventoryMovement.create({
            data: {
              productId: newProduct.id,
              type: 'IN',
              quantity: parseFloat(data.stock),
              previousStock: 0,
              newStock: parseFloat(data.stock),
              reason: 'Stock inicial',
            },
          });
        }

        return newProduct;
      });

      await cache.delPattern('products:*');

      const businessId = req.user?.businessId;
      if (businessId) {
        emitToBusinesss(businessId, socketEvents.INVENTORY_UPDATED, { type: 'created', product });
      }

      return created(res, product, 'Producto creado');
    } catch (err) {
      next(err);
    }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = req.body;

      const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
      if (!existing) throw new AppError('Producto no encontrado', 404);

      const product = await prisma.product.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          categoryId: data.categoryId,
          brandId: data.brandId,
          supplierId: data.supplierId,
          costPrice: data.costPrice !== undefined ? parseFloat(data.costPrice) : undefined,
          salePrice: data.salePrice !== undefined ? parseFloat(data.salePrice) : undefined,
          wholesalePrice: data.wholesalePrice ? parseFloat(data.wholesalePrice) : undefined,
          minStock: data.minStock !== undefined ? parseFloat(data.minStock) : undefined,
          unit: data.unit,
          taxRate: data.taxRate !== undefined ? parseFloat(data.taxRate) : undefined,
          image: data.image,
          isActive: data.isActive,
        },
      });

      await cache.del(`product:${id}`);
      await cache.delPattern('products:*');

      const businessId = req.user?.businessId;
      if (businessId) {
        emitToBusinesss(businessId, socketEvents.INVENTORY_UPDATED, { type: 'updated', product });
      }

      return success(res, product, 'Producto actualizado');
    } catch (err) {
      next(err);
    }
  },

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
      if (!product) throw new AppError('Producto no encontrado', 404);

      await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
      await cache.del(`product:${id}`);

      return success(res, null, 'Producto eliminado');
    } catch (err) {
      next(err);
    }
  },

  async adjustStock(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { quantity, type, reason } = req.body;

      const product = await prisma.product.findFirst({ where: { id, deletedAt: null } });
      if (!product) throw new AppError('Producto no encontrado', 404);

      const qty = parseFloat(quantity);
      const newStock = type === 'IN'
        ? product.stock + qty
        : type === 'OUT'
          ? product.stock - qty
          : qty; // ADJUSTMENT sets absolute

      if (newStock < 0 && !product.allowNegativeStock) {
        throw new AppError('Stock insuficiente', 400);
      }

      await prisma.$transaction([
        prisma.product.update({ where: { id }, data: { stock: newStock } }),
        prisma.inventoryMovement.create({
          data: {
            productId: id,
            type: type as any,
            quantity: qty,
            previousStock: product.stock,
            newStock,
            reason,
          },
        }),
      ]);

      await cache.del(`product:${id}`);

      const businessId = req.user?.businessId;
      if (businessId && newStock <= product.minStock) {
        emitToBusinesss(businessId, socketEvents.LOW_STOCK_ALERT, { product: { id, name: product.name, stock: newStock, minStock: product.minStock } });
      }

      return success(res, { stock: newStock }, 'Stock ajustado');
    } catch (err) {
      next(err);
    }
  },

  async getLowStock(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const products = await prisma.$queryRaw`
        SELECT id, code, name, stock, "minStock", "salePrice"
        FROM products
        WHERE stock <= "minStock"
          AND "deletedAt" IS NULL
          AND "isActive" = true
        ORDER BY stock ASC
        LIMIT 50
      `;
      return success(res, products);
    } catch (err) {
      next(err);
    }
  },

  async duplicate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const original = await prisma.product.findFirst({ where: { id, deletedAt: null } });
      if (!original) throw new AppError('Producto no encontrado', 404);

      const { id: _id, createdAt: _c, updatedAt: _u, code, barcode, ...rest } = original;
      const newCode = `${code}-COPIA-${Date.now()}`;

      const copy = await prisma.product.create({
        data: { ...rest, code: newCode, barcode: null, stock: 0 },
      });

      return created(res, copy, 'Producto duplicado');
    } catch (err) {
      next(err);
    }
  },
};
