import { prisma } from '../config/database';
import { AppError } from './response';
import { AuthRequest } from '../middlewares/auth';

// Resuelve a qué bodega aplica una operación (venta, producto, compra, ajuste
// de stock): si el usuario tiene una bodega fija, cualquier valor distinto en
// el body es un 403; si no tiene bodega fija (dueño/admin sin asignar), el
// valor del body debe pertenecer al negocio; si no hay nada, cae a la bodega
// más antigua del negocio (siempre existe una, se crea al registrarse).
// Centraliza una guardia que antes estaba duplicada en sale.controller.ts y
// product.controller.ts, y ahora también hace falta en compras y ajuste de
// stock — a diferencia de las validaciones anteriores, esta SIEMPRE devuelve
// una bodega concreta (nunca null), porque escribir stock por bodega exige
// saber en cuál.
export async function resolveEffectiveBranchId(
  tx: { branch: { findFirst: typeof prisma.branch.findFirst } },
  req: AuthRequest,
  bodyBranchId?: string | null,
): Promise<string> {
  const businessId = req.user!.businessId!;
  const userBranchId = req.user?.branchId || null;

  if (userBranchId) {
    if (bodyBranchId && bodyBranchId !== userBranchId) {
      throw new AppError('No tienes acceso a esta bodega', 403);
    }
    return userBranchId;
  }

  if (bodyBranchId) {
    const branch = await tx.branch.findFirst({ where: { id: bodyBranchId, businessId }, select: { id: true } });
    if (!branch) throw new AppError('Bodega no válida para este negocio', 403);
    return bodyBranchId;
  }

  const oldest = await tx.branch.findFirst({
    where: { businessId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!oldest) throw new AppError('No se encontró una bodega para este negocio', 400);
  return oldest.id;
}
