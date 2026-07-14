import { Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { prisma } from '../config/database';
import { cache } from '../config/redis';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';
import { emitToBusinesss, socketEvents } from '../config/socket';
import { notifyLowStock, notifyLowStockBatch } from '../services/notification.service';
import { getPlan } from '../config/plans';
import { acquirePlanLimitLock } from '../utils/planLimitLock';
import { deleteImage } from '../config/cloudinary';
import { logger } from '../config/logger';
import { resolveEffectiveBranchId } from '../utils/resolveBranch';

const CACHE_TTL = 300;

export const productController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const search = getSearch(req);
      const { categoryId, brandId, supplierId, isActive, branchId } = req.query;
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

      // El POS manda su propia bodega para que la etiqueta de stock refleje lo
      // que de verdad se va a descontar ahí — Inventario nunca manda esto y
      // sigue viendo el total (Product.stock), como antes.
      let result = products;
      if (typeof branchId === 'string' && branchId) {
        const stocks = await prisma.productStock.findMany({
          where: { branchId, productId: { in: products.map((p) => p.id) } },
          select: { productId: true, stock: true },
        });
        const stockByProduct = new Map(stocks.map((s) => [s.productId, Number(s.stock)]));
        result = products.map((p) => ({ ...p, stock: stockByProduct.get(p.id) ?? 0 }));
      }

      return paginated(res, result, total, page, limit);
    } catch (err) {
      next(err);
    }
  },

  async getStockByBranch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const businessId = req.user!.businessId;
      const product = await prisma.product.findFirst({
        where: { id: req.params.id, deletedAt: null, businessId },
        select: { id: true },
      });
      if (!product) throw new AppError('Producto no encontrado', 404);

      const [branches, stocks] = await Promise.all([
        prisma.branch.findMany({ where: { businessId, deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: 'asc' } }),
        prisma.productStock.findMany({ where: { productId: req.params.id }, select: { branchId: true, stock: true } }),
      ]);
      const stockByBranch = new Map(stocks.map((s) => [s.branchId, Number(s.stock)]));

      const data = branches.map((b) => ({ branchId: b.id, branchName: b.name, stock: stockByBranch.get(b.id) ?? 0 }));
      return success(res, data);
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

      const branchId = await resolveEffectiveBranchId(prisma, req, data.branchId);

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
              branchId,
            },
          });
          await tx.productStock.create({
            data: { productId: newProduct.id, branchId, stock: initialQty },
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

      // A diferencia de crear un producto (donde caer a la bodega más antigua es
      // un default inofensivo), un ajuste de stock SÍ debe fallar si no está claro
      // en cuál bodega — nunca se debe adivinar dónde quedó físicamente la mercancía.
      const bodyBranchId: string | undefined = req.body.branchId;
      const userBranchId = req.user?.branchId || null;
      // ADMIN/SUPERVISOR administran todo el negocio — su bodega fija (si la
      // tienen, ej. la que se les asignó al registrar el negocio) es solo un
      // default, no debe impedirles ajustar stock en otra bodega. Ver la nota
      // equivalente en resolveBranch.ts (resolveEffectiveBranchId).
      const isManager = req.user?.role === 'ADMIN' || req.user?.role === 'SUPERVISOR';
      let targetBranchId: string;
      if (userBranchId && !isManager) {
        if (bodyBranchId && bodyBranchId !== userBranchId) throw new AppError('No tienes acceso a esta bodega', 403);
        targetBranchId = userBranchId;
      } else if (bodyBranchId) {
        const branch = await prisma.branch.findFirst({ where: { id: bodyBranchId, businessId: req.user!.businessId }, select: { id: true } });
        if (!branch) throw new AppError('Bodega no válida para este negocio', 403);
        targetBranchId = bodyBranchId;
      } else if (userBranchId) {
        // Manager sin bodega explícita en el body: usa la suya propia como default.
        targetBranchId = userBranchId;
      } else {
        const branches = await prisma.branch.findMany({ where: { businessId: req.user!.businessId, deletedAt: null }, select: { id: true } });
        if (branches.length === 0) throw new AppError('No se encontró una bodega para este negocio', 400);
        if (branches.length > 1) throw new AppError('Debes indicar en qué bodega ajustar el stock', 400);
        targetBranchId = branches[0].id;
      }

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

        // Bloquea (o crea en 0) la fila de stock de ESTA bodega — mismo patrón
        // INSERT ... ON CONFLICT que ya usa sale.controller.ts.
        const [psRow] = await tx.$queryRawUnsafe<any[]>(
          `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
           VALUES ($1, $2, $3, 0, now(), now())
           ON CONFLICT ("productId", "branchId") DO UPDATE SET "updatedAt" = product_stocks."updatedAt"
           RETURNING stock`,
          randomUUID(), id, targetBranchId,
        );
        const oldBranchStock = Number(psRow.stock);

        const newBranchStock = type === 'IN'
          ? oldBranchStock + qty
          : type === 'OUT'
            ? oldBranchStock - qty
            : qty; // ADJUSTMENT fija el valor absoluto DE ESTA BODEGA
        if (newBranchStock < 0 && !locked.allowNegativeStock) {
          throw new AppError('Stock insuficiente', 400);
        }
        // El total del producto se mueve por el mismo delta que la bodega — así
        // ADJUSTMENT (que fija un valor absoluto en la bodega) no pisa con ese
        // mismo número absoluto el stock de las OTRAS bodegas del producto.
        const branchDelta = newBranchStock - oldBranchStock;
        const newStock = locked.stock + branchDelta;
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
            stock: { increment: branchDelta },
            ...(restocked ? { lowStockNotifiedAt: null } : {}),
            ...(isNewLowStock ? { lowStockNotifiedAt: new Date() } : {}),
          },
        });
        await tx.productStock.update({
          where: { productId_branchId: { productId: id, branchId: targetBranchId } },
          data: { stock: newBranchStock },
        });

        await tx.inventoryMovement.create({
          data: {
            productId: id,
            type: type as any,
            quantity: qty,
            previousStock: locked.stock,
            branchId: targetBranchId,
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

  // Carga/conteo masivo de stock en UNA bodega — pantalla "Cargar inventario"
  // en Transferencias. A diferencia de adjustStock (un producto a la vez),
  // procesa en lotes de tamaño fijo (no una sola transacción gigante) para no
  // tener transacciones larguísimas reteniendo locks contra ventas/ajustes
  // concurrentes en negocios con catálogos grandes.
  async bulkStockCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { branchId, items, reason } = req.body;
      const businessId = req.user!.businessId;

      const branch = await prisma.branch.findFirst({
        where: { id: branchId, businessId, deletedAt: null },
        select: { id: true },
      });
      if (!branch) throw new AppError('Bodega no válida para este negocio', 403);

      // Se deduplica ANTES de validar pertenencia — de lo contrario un mismo
      // productId repetido infla productIds.length y el count() (que cuenta
      // ids distintos) nunca cuadra, rechazando de forma incorrecta un batch válido.
      const qtyByProduct = new Map<string, number>();
      for (const item of items) {
        qtyByProduct.set(item.productId, parseFloat(item.quantity));
      }
      const productIds = [...qtyByProduct.keys()];

      const validCount = await prisma.product.count({
        where: { id: { in: productIds }, businessId, deletedAt: null },
      });
      if (validCount !== productIds.length) {
        throw new AppError('Uno o más productos no pertenecen a este negocio', 403);
      }

      const sortedIds = [...productIds].sort();
      let updated = 0;
      let skipped = 0;
      const lowStockCrossed: Array<{ id: string; name: string; stock: number; minStock: number }> = [];

      const CHUNK_SIZE = 50;
      for (let i = 0; i < sortedIds.length; i += CHUNK_SIZE) {
        const chunk = sortedIds.slice(i, i + CHUNK_SIZE);

        await prisma.$transaction(async (tx) => {
          for (const pid of chunk) {
            const quantity = qtyByProduct.get(pid)!;

            // Lock de la fila de products — igual que adjustStock, imprescindible
            // porque este endpoint también toca Product.stock (el total).
            const rows = await tx.$queryRawUnsafe<any[]>(
              `SELECT id, stock, name, "allowNegativeStock", "minStock", "lowStockNotifiedAt", "costPrice"
               FROM products WHERE id::text = $1 AND "deletedAt" IS NULL FOR UPDATE`,
              pid,
            );
            const locked = rows[0];
            if (!locked) continue; // ya validado arriba, defensivo por si acaso

            // Lock-or-create de la fila product_stocks de esta bodega.
            const [psRow] = await tx.$queryRawUnsafe<any[]>(
              `INSERT INTO product_stocks (id, "productId", "branchId", stock, "createdAt", "updatedAt")
               VALUES ($1, $2, $3, 0, now(), now())
               ON CONFLICT ("productId", "branchId") DO UPDATE SET "updatedAt" = product_stocks."updatedAt"
               RETURNING stock`,
              randomUUID(), pid, branchId,
            );
            const oldBranchStock = Number(psRow.stock);
            const branchDelta = quantity - oldBranchStock;

            // Sin cambio real — se salta sin crear movimiento, para no inundar
            // el historial en un reconteo donde la mayoría no cambió.
            if (branchDelta === 0) { skipped++; continue; }

            const totalStock = Number(locked.stock);
            const newTotal = totalStock + branchDelta;
            if ((quantity < 0 || newTotal < 0) && !locked.allowNegativeStock) {
              throw new AppError(`Stock insuficiente para: ${locked.name}`, 400);
            }

            const minStock = Number(locked.minStock);
            const restocked = newTotal > minStock && !!locked.lowStockNotifiedAt;
            const isNewLowStock = newTotal <= minStock && !locked.lowStockNotifiedAt;

            await tx.product.update({
              where: { id: pid },
              data: {
                stock: { increment: branchDelta },
                ...(restocked ? { lowStockNotifiedAt: null } : {}),
                ...(isNewLowStock ? { lowStockNotifiedAt: new Date() } : {}),
              },
            });
            await tx.productStock.update({
              where: { productId_branchId: { productId: pid, branchId } },
              data: { stock: quantity },
            });
            await tx.inventoryMovement.create({
              data: {
                productId: pid,
                type: branchDelta > 0 ? 'IN' : 'OUT',
                quantity: Math.abs(branchDelta),
                previousStock: totalStock,
                newStock: newTotal,
                reason: reason || 'Conteo de bodega',
                referenceType: 'STOCK_COUNT',
                unitCost: Number(locked.costPrice),
                totalCost: Number(locked.costPrice) * Math.abs(branchDelta),
                branchId,
              },
            });

            updated++;
            if (isNewLowStock) {
              lowStockCrossed.push({ id: pid, name: locked.name, stock: newTotal, minStock });
            }
          }
        }, { timeout: 30000 });
      }

      if (businessId) {
        emitToBusinesss(businessId, socketEvents.INVENTORY_UPDATED, { type: 'bulk-stock-count', branchId });
        for (const product of lowStockCrossed) {
          emitToBusinesss(businessId, socketEvents.LOW_STOCK_ALERT, { product });
        }
        if (lowStockCrossed.length > 0) {
          await notifyLowStockBatch(businessId, lowStockCrossed).catch((err) => {
            logger.error(`Fallo al notificar stock bajo (businessId=${businessId}): ${err?.message || err}`);
          });
        }
      }

      return success(res, { updated, skipped }, `${updated} producto(s) actualizados`);
    } catch (err) {
      next(err);
    }
  },
};
