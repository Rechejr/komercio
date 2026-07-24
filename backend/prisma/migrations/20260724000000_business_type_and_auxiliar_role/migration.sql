-- Ventrix Contable — cimiento del segundo producto.
--
-- Cambios ADITIVOS: no alteran ninguna fila ni comportamiento existente.
--   1. Nuevo valor de enum AUXILIAR (ayudante del contador).
--   2. Nueva columna businesses.type con DEFAULT 'pos' → todos los negocios
--      que ya existen quedan marcados como comercio automáticamente.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'AUXILIAR';

-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'pos';
