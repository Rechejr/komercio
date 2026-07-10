import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';
import { emitToBusinesss, socketEvents } from '../config/socket';
import { notifyLowStock } from '../services/notification.service';
import { getPlan } from '../config/plans';
import { acquirePlanLimitLock } from '../utils/planLimitLock';
import { deleteImage } from '../config/cloudinary';
import { logger } from '../config/logger';

const CACHE_TTL = 300;

export const productController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const search = getSearch(req);
      const { categoryId, brandId, supplierId, isActive } = req.query;
      const businessId = req.user!.businessId;

      const where: any = { deletedAt: null, businessId };
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
      const cacheKey = `product:${req.user!.businessId}:${req.params.id}`;
      const cached = await cache.get(cacheKey);
      if (cached) return success(res, cached);

      const product = await prisma.product.findFirst({
        where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
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
      if (!data.name?.toString().trim()) throw new AppError('El nombre del producto es requerido', 400);
      if (!data.salePrice && data.salePrice !== 0) throw new AppError('El precio de venta es requerido', 400);
      const businessId = req.user!.businessId;

      // Un usuario con sucursal fija (cajero/staff) no puede crear productos a
      // nombre de otra sucursal solo con mandar otro branchId en el body — antes
      // se validaba que la sucursal perteneciera al negocio, pero no que fuera la
      // del usuario.
      const userBranchId = req.user?.branchId || null;
      if (userBranchId) {
        if (data.branchId && data.branchId !== userBranchId) throw new AppError('No tienes acceso a esta sucursal', 403);
      } else if (data.branchId) {
        const branch = await prisma.branch.findFirst({
          where: { id: data.branchId, businessId },
          select: { id: true },
        });
        if (!branch) throw new AppError('Sucursal no válida para este negocio', 403);
      }
      const branchId = userBranchId || data.branchId || null;

      if (data.supplierId) {
        const sup = await prisma.supplier.findFirst({ where: { id: data.supplierId, businessId, deletedAt: null } });
        if (!sup) throw new AppError('Proveedor inválido', 400);
      }

      const product = await prisma.$transaction(async (tx) => {
        // Recuento atómico: el middleware planLimit.products() ya rechazó el caso
        // normal, pero su count()-then-allow no es atómico — dos altas casi
        // simultáneas podían leer el mismo conteo y ambas pasar. El advisory lock
        // serializa esta sección contra cualquier otra alta concurrente del mismo
        // negocio, así que el recuento de aquí en adelante sí es confiable.
        await acquirePlanLimitLock(tx, businessId!, 'products');
        const biz = await tx.business.findUnique({ where: { id: businessId! }, select: { plan: true, planExpiresAt: true } });
        if (biz) {
          const effectivePlan = biz.plan === 'pro' && biz.planExpiresAt && biz.planExpiresAt < new Date() ? 'free' : biz.plan;
          const limits = getPlan(effectivePlan);
          if (limits.products !== Infinity) {
            const count = await tx.product.count({ where: { businessId: businessId!, deletedAt: null } });
            if (count >= limits.products) {
              throw new AppError(`Límite de ${limits.products} productos alcanzado en el plan gratuito. Actualiza a Pro para continuar.`, 403);
            }
          }
        }

        const newProduct = await tx.product.create({
          data: {
            code: data.code,
            barcode: data.barcode || null,
            name: data.name,
            description: data.description,
            categoryId: data.categoryId || null,
            brandId: data.brandId || null,
            supplierId: data.supplierId || null,
            branchId,
            businessId,
            costPrice: parseFloat(data.costPrice) || 0,
            salePrice: parseFloat(data.salePrice) || 0,
            wholesalePrice: data.wholesalePrice ? parseFloat(data.wholesalePrice) : null,
            stock: parseFloat(data.stock) || 0,
            minStock: parseFloat(data.minStock) || 0,
            unit: data.unit || 'unit',
            taxRate: parseFloat(data.taxRate) || 0,
            allowNegativeStock: !!data.allowNegativeStock,
            image: data.images?.[0] || data.image || null,
            images: Array.isArray(data.images) ? data.images : [],
          },
        });

        if (parseFloat(data.stock) > 0) {
          const initialCost = parseFloat(data.costPrice) || 0;
          const initialQty = parseFloat(data.stock);
          await tx.inventoryMovement.create({
            data: {
              productId: newProduct.id,
              type: 'IN',
              quantity: initialQty,
              previousStock: 0,
              newStock: initialQty,
              reason: 'Stock inicial',
              unitCost: initialCost,
              totalCost: initialCost * initialQty,
            },
          });
        }

        return newProduct;
      });

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

      const businessId = req.user!.businessId;
      const existing = await prisma.product.findFirst({
        where: { id, deletedAt: null, businessId },
      });
      if (!existing) throw new AppError('Producto no encontrado', 404);

      if (data.supplierId) {
        const sup = await prisma.supplier.findFirst({ where: { id: data.supplierId, businessId, deletedAt: null } });
        if (!sup) throw new AppError('Proveedor inválido', 400);
      }

      const product = await prisma.product.update({
        where: { id },
        data: {
          code: data.code,
          barcode: data.barcode !== undefined ? (data.barcode || null) : undefined,
          name: data.name,
          description: data.description,
          categoryId: data.categoryId !== undefined ? (data.categoryId || null) : undefined,
          brandId: data.brandId !== undefined ? (data.brandId || null) : undefined,
          supplierId: data.supplierId !== undefined ? (data.supplierId || null) : undefined,
          costPrice: data.costPrice !== undefined ? parseFloat(data.costPrice) : undefined,
          salePrice: data.salePrice !== undefined ? parseFloat(data.salePrice) : undefined,
          wholesalePrice: data.wholesalePrice ? parseFloat(data.wholesalePrice) : undefined,
          minStock: data.minStock !== undefined ? parseFloat(data.minStock) : undefined,
          unit: data.unit,
          taxRate: data.taxRate !== undefined ? parseFloat(data.taxRate) : undefined,
          image: Array.isArray(data.images) ? (data.images[0] || null) : data.image,
          images: Array.isArray(data.images) ? data.images : undefined,
          isActive: data.isActive,
          allowNegativeStock: data.allowNegativeStock,
        },
      });

      await cache.del(`product:${businessId}:${id}`);

      if (businessId) {
        emitToBusinesss(businessId, socketEvents.INVENTORY_UPDATED, { type: 'updated', product });
      }

      // Limpieza best-effort de imágenes reemplazadas/quitadas — de lo contrario
      // quedan huérfanas en Cloudinary para siempre (nadie vuelve a referenciarlas).
      if (Array.isArray(data.images)) {
        const removed = (existing.images || []).filter((url) => !data.images.includes(url));
        for (const url of removed) {
          deleteImage(url).catch((err) => logger.error(`Fallo al borrar imagen huérfana de Cloudinary: ${err?.message || err}`));
        }
      }

      return success(res, product, 'Producto actualizado');
    } catch (err) {
      next(err);
    }
  },

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const product = await prisma.product.findFirst({
        where: { id, deletedAt: null, businessId: req.user!.businessId },
      });
      if (!product) throw new AppError('Producto no encontrado', 404);

      await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
      await cache.del(`product:${req.user!.businessId}:${id}`);

      // No hay endpoint de restauración — una vez borrado, el producto es
      // inalcanzable para siempre, así que sus imágenes en Cloudinary quedarían
      // huérfanas si no se limpian aquí (best-effort, no bloquea la respuesta).
      for (const url of product.images || []) {
        deleteImage(url).catch((err) => logger.error(`Fallo al borrar imagen huérfana de Cloudinary: ${err?.message || err}`));
      }

      return success(res, null, 'Producto eliminado');
    } catch (err) {
      next(err);
    }
  },

  async adjustStock(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { quantity, type, reason } = req.body;
      const qty = parseFloat(quantity);

      interface AdjustProductRow {
        id: string; stock: number; name: string;
        allowNegativeStock: boolean; minStock: number; businessId: string;
        costPrice: number; lowStockNotifiedAt: Date | null;
      }

      const { newStock, locked, isNewLowStock } = await prisma.$transaction(async (tx) => {
        // Lock row before reading — prevents two concurrent adjustments from both reading
        // the same previousStock value and producing an inconsistent movement log.
        // costPrice is Decimal(65,30) — ::float8 cast on NUMERIC causes a Prisma
        // type-resolution error, so receive as string and convert with Number().
        const rows = await tx.$queryRawUnsafe<any[]>(
          `SELECT id, stock, name, "allowNegativeStock", "minStock", "businessId", "costPrice", "lowStockNotifiedAt"
           FROM products WHERE id::text = $1 AND "deletedAt" IS NULL FOR UPDATE`,
          id,
        );
        const raw = rows[0];
        const locked: AdjustProductRow | undefined = raw ? {
          id: raw.id,
          stock: Number(raw.stock),
          name: raw.name,
          allowNegativeStock: raw.allowNegativeStock,
          minStock: Number(raw.minStock),
          businessId: raw.businessId,
          costPrice: Number(raw.costPrice),
          lowStockNotifiedAt: raw.lowStockNotifiedAt,
        } : undefined;

        if (!locked) throw new AppError('Producto no encontrado', 404);
        if (locked.businessId !== req.user!.businessId) throw new AppError('Producto no encontrado', 404);

        const newStock = type === 'IN'
          ? locked.stock + qty
          : type === 'OUT'
            ? locked.stock - qty
            : qty; // ADJUSTMENT sets absolute value

        if (newStock < 0 && !locked.allowNegativeStock) {
          throw new AppError('Stock insuficiente', 400);
        }

        // Reabastecer por encima del mínimo limpia la marca de "ya notificado", para
        // que la próxima vez que vuelva a caer se avise de nuevo; y solo se notifica
        // la primera vez que cae al mínimo (antes se avisaba en cada ajuste).
        const restocked = newStock > locked.minStock && !!locked.lowStockNotifiedAt;
        const isNewLowStock = newStock <= locked.minStock && !locked.lowStockNotifiedAt;
        await tx.product.update({
          where: { id },
          data: {
            stock: type === 'IN' ? { increment: qty } : type === 'OUT' ? { decrement: qty } : newStock,
            ...(restocked ? { lowStockNotifiedAt: null } : {}),
            ...(isNewLowStock ? { lowStockNotifiedAt: new Date() } : {}),
          },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: id,
            type: type as any,
            quantity: qty,
            previousStock: locked.stock,
            newStock,
            reason,
            unitCost: locked.costPrice,
            totalCost: locked.costPrice * qty,
          },
        });

        return { newStock, locked, isNewLowStock };
      });

      await cache.del(`product:${req.user!.businessId}:${id}`);

      const businessId = req.user?.businessId;
      if (businessId && isNewLowStock) {
        const lowStockProduct = { id, name: locked.name, stock: newStock, minStock: locked.minStock };
        emitToBusinesss(businessId, socketEvents.LOW_STOCK_ALERT, { product: lowStockProduct });
        await notifyLowStock(businessId, lowStockProduct);
      }

      return success(res, { stock: newStock }, 'Stock ajustado');
    } catch (err) {
      next(err);
    }
  },

  async getLowStock(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId;
      const products = await prisma.$queryRaw`
        SELECT id, code, name, stock, "minStock", "salePrice"
        FROM products
        WHERE stock <= "minStock"
          AND "deletedAt" IS NULL
          AND "isActive" = true
          AND "businessId" = ${businessId}
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
      const original = await prisma.product.findFirst({
        where: { id, deletedAt: null, businessId: req.user!.businessId },
      });
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
