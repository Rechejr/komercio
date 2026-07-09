import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError, success, created, paginated } from '../utils/response';
import { getPagination, getSearch } from '../utils/pagination';
import { AuthRequest } from '../middlewares/auth';

export const supplierController = {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page, limit, skip } = getPagination(req);
      const search = getSearch(req);
      const businessId = req.user!.businessId;
      const where: any = { deletedAt: null, businessId };
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }
      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          where, skip, take: limit, orderBy: { name: 'asc' },
          include: { _count: { select: { products: true, purchases: true } } },
        }),
        prisma.supplier.count({ where }),
      ]);
      return paginated(res, suppliers, total, page, limit);
    } catch (err) { next(err); }
  },

  async getOne(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const supplier = await prisma.supplier.findFirst({
        where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
        include: {
          products: { select: { id: true, name: true, code: true, stock: true }, take: 100, orderBy: { name: 'asc' } },
          purchases: { orderBy: { createdAt: 'desc' }, take: 10, select: { id: true, invoiceNumber: true, total: true, purchaseDate: true } },
        },
      });
      if (!supplier) throw new AppError('Proveedor no encontrado', 404);
      return success(res, supplier);
    } catch (err) { next(err); }
  },

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const name = req.body.name?.toString().trim();
      if (!name) throw new AppError('El nombre del proveedor es requerido', 400);
      const { legalName, document, phone, mobile, email, address, city, contactName, notes } = req.body;
      // Normalizar "" a null: con el unique constraint (businessId, document), dos
      // proveedores sin documento guardados como "" chocarían entre sí (múltiples
      // NULL sí están permitidos bajo un índice único).
      const normalizedDoc = document?.toString().trim() || null;
      const base = { name, document: normalizedDoc, phone, email, address, city, contactName, notes, businessId: req.user!.businessId };
      // select for retry excludes legalName/mobile which may not exist in DB yet
      const oldSelect = { id: true, businessId: true, name: true, document: true, phone: true, email: true, address: true, city: true, contactName: true, notes: true, isActive: true, createdAt: true, updatedAt: true, deletedAt: true };
      let supplier: any;
      try {
        supplier = await prisma.supplier.create({ data: { ...base, legalName, mobile } });
      } catch (colErr: any) {
        // Retry without extended columns while migration 20260705100000 is pending.
        // Use explicit select to avoid RETURNING legalName/mobile which don't exist yet.
        if (colErr?.message?.toLowerCase().includes('column') || colErr?.message?.toLowerCase().includes('does not exist')) {
          supplier = await prisma.supplier.create({ data: base, select: oldSelect });
        } else {
          throw colErr;
        }
      }
      return created(res, supplier, 'Proveedor creado');
    } catch (err) { next(err); }
  },

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.supplier.findFirst({
        where: { id, deletedAt: null, businessId: req.user!.businessId },
      });
      if (!existing) throw new AppError('Proveedor no encontrado', 404);
      const { name, legalName, document, phone, mobile, email, address, city, contactName, notes } = req.body;
      const normalizedDoc = document !== undefined ? (document?.toString().trim() || null) : undefined;
      const base = { name, document: normalizedDoc, phone, email, address, city, contactName, notes };
      const oldSelect = { id: true, businessId: true, name: true, document: true, phone: true, email: true, address: true, city: true, contactName: true, notes: true, isActive: true, createdAt: true, updatedAt: true, deletedAt: true };
      let supplier: any;
      try {
        supplier = await prisma.supplier.update({ where: { id }, data: { ...base, legalName, mobile } });
      } catch (colErr: any) {
        if (colErr?.message?.toLowerCase().includes('column') || colErr?.message?.toLowerCase().includes('does not exist')) {
          supplier = await prisma.supplier.update({ where: { id }, data: base, select: oldSelect });
        } else {
          throw colErr;
        }
      }
      return success(res, supplier, 'Proveedor actualizado');
    } catch (err) { next(err); }
  },

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.supplier.findFirst({
        where: { id: req.params.id, deletedAt: null, businessId: req.user!.businessId },
      });
      if (!existing) throw new AppError('Proveedor no encontrado', 404);
      await prisma.supplier.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
      return success(res, null, 'Proveedor eliminado');
    } catch (err) { next(err); }
  },
};
