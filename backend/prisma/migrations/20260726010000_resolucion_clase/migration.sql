-- Clase de resolución DIAN: autorización o habilitación. Columna nullable
-- (los registros previos quedan en NULL). Additivo, no toca datos existentes.

-- CreateEnum
CREATE TYPE "clase_resolucion" AS ENUM ('autorizacion', 'habilitacion');

-- AlterTable
ALTER TABLE "resoluciones_dian" ADD COLUMN "clase" "clase_resolucion";
