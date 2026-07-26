-- Ventrix Contable — mini-agendas MANUALES para lo que NO está en el calendario
-- DIAN: información exógena (se conserva) y "otras responsabilidades" (se purgan
-- 2 meses después de la fecha). Tabla nueva y aislada; no toca nada existente.

-- CreateEnum
CREATE TYPE "tipo_resp_manual" AS ENUM ('exogena', 'otra');

-- CreateEnum
CREATE TYPE "estado_resp_manual" AS ENUM ('pendiente', 'presentado');

-- CreateTable
CREATE TABLE "responsabilidades_manuales" (
    "id" TEXT NOT NULL,
    "taxClientId" TEXT NOT NULL,
    "tipo" "tipo_resp_manual" NOT NULL,
    "concepto" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "estado_resp_manual" NOT NULL DEFAULT 'pendiente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responsabilidades_manuales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "responsabilidades_manuales_taxClientId_idx" ON "responsabilidades_manuales"("taxClientId");

-- CreateIndex
CREATE INDEX "responsabilidades_manuales_tipo_fecha_idx" ON "responsabilidades_manuales"("tipo", "fecha");

-- AddForeignKey
ALTER TABLE "responsabilidades_manuales" ADD CONSTRAINT "responsabilidades_manuales_taxClientId_fkey" FOREIGN KEY ("taxClientId") REFERENCES "tax_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
