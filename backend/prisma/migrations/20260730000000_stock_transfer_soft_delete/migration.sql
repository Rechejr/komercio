-- Editar/anular transferencias entre bodegas.
-- `deletedAt` es soft delete: anular revierte el stock pero conserva la fila,
-- porque los inventory_movements de auditoría referencian este id.
-- Ambas columnas son aditivas y nullable/con default, así que las filas
-- existentes no requieren backfill.

-- AlterTable
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "stock_transfers" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
