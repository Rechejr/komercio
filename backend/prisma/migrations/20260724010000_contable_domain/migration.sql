-- Ventrix Contable — dominio de la agenda tributaria.
-- Tablas nuevas, aisladas del POS: TaxClient/Vencimiento/ResolucionDian
-- (multi-tenant vía Business) y los calendarios GLOBALES. Nada de esto toca
-- ninguna tabla existente.

-- CreateEnum
CREATE TYPE "calidad" AS ENUM ('responsable_iva', 'declarante_renta', 'agente_retenedor', 'impoconsumo', 'rst');

-- CreateEnum
CREATE TYPE "obligacion" AS ENUM ('renta', 'iva', 'retefuente', 'ica', 'exogena', 'pila', 'impoconsumo', 'simple');

-- CreateEnum
CREATE TYPE "tipo_persona" AS ENUM ('natural', 'juridica');

-- CreateEnum
CREATE TYPE "iva_periodicidad" AS ENUM ('bimestral', 'cuatrimestral');

-- CreateEnum
CREATE TYPE "estado_vencimiento" AS ENUM ('pendiente', 'en_proceso', 'presentada', 'pagada', 'vencida');

-- CreateEnum
CREATE TYPE "tipo_resolucion" AS ENUM ('facturacion_numeracion', 'habilitacion_electronica', 'otra');

-- CreateEnum
CREATE TYPE "modalidad_resolucion" AS ENUM ('pos', 'electronica', 'contingencia');

-- CreateEnum
CREATE TYPE "estado_resolucion" AS ENUM ('vigente', 'por_vencer', 'vencida', 'agotada');

-- CreateTable
CREATE TABLE "tax_clients" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "razonSocial" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "dv" INTEGER NOT NULL,
    "celular" TEXT,
    "direccion" TEXT,
    "tipoPersona" "tipo_persona" NOT NULL,
    "responsabilidades" "calidad"[],
    "ivaPeriodicidad" "iva_periodicidad",
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vencimientos" (
    "id" TEXT NOT NULL,
    "taxClientId" TEXT NOT NULL,
    "obligacion" "obligacion" NOT NULL,
    "periodo" TEXT NOT NULL,
    "fecha" DATE NOT NULL,
    "estado" "estado_vencimiento" NOT NULL DEFAULT 'pendiente',
    "monto" DECIMAL(65,30),
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vencimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resoluciones_dian" (
    "id" TEXT NOT NULL,
    "taxClientId" TEXT NOT NULL,
    "tipo" "tipo_resolucion" NOT NULL,
    "numero" TEXT NOT NULL,
    "fechaExpedicion" DATE NOT NULL,
    "prefijo" TEXT,
    "rangoDesde" INTEGER,
    "rangoHasta" INTEGER,
    "consecutivoActual" INTEGER NOT NULL DEFAULT 0,
    "modalidad" "modalidad_resolucion",
    "fechaVigencia" DATE NOT NULL,
    "estado" "estado_resolucion" NOT NULL DEFAULT 'vigente',
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resoluciones_dian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendario_dian" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "obligacion" TEXT NOT NULL,
    "variante" TEXT,
    "periodo" TEXT NOT NULL,
    "periodoOrden" INTEGER NOT NULL,
    "digito" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,

    CONSTRAINT "calendario_dian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendario_renta_natural" (
    "id" SERIAL NOT NULL,
    "anio" INTEGER NOT NULL,
    "dosDigitos" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,

    CONSTRAINT "calendario_renta_natural_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_clients_businessId_idx" ON "tax_clients"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_clients_businessId_nit_dv_key" ON "tax_clients"("businessId", "nit", "dv");

-- CreateIndex
CREATE INDEX "vencimientos_taxClientId_idx" ON "vencimientos"("taxClientId");

-- CreateIndex
CREATE INDEX "vencimientos_fecha_idx" ON "vencimientos"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "vencimientos_taxClientId_obligacion_periodo_key" ON "vencimientos"("taxClientId", "obligacion", "periodo");

-- CreateIndex
CREATE INDEX "resoluciones_dian_taxClientId_idx" ON "resoluciones_dian"("taxClientId");

-- CreateIndex
CREATE INDEX "resoluciones_dian_fechaVigencia_idx" ON "resoluciones_dian"("fechaVigencia");

-- CreateIndex
CREATE INDEX "calendario_dian_anio_obligacion_variante_digito_idx" ON "calendario_dian"("anio", "obligacion", "variante", "digito");

-- CreateIndex
CREATE UNIQUE INDEX "calendario_renta_natural_anio_dosDigitos_key" ON "calendario_renta_natural"("anio", "dosDigitos");

-- AddForeignKey
ALTER TABLE "tax_clients" ADD CONSTRAINT "tax_clients_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vencimientos" ADD CONSTRAINT "vencimientos_taxClientId_fkey" FOREIGN KEY ("taxClientId") REFERENCES "tax_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resoluciones_dian" ADD CONSTRAINT "resoluciones_dian_taxClientId_fkey" FOREIGN KEY ("taxClientId") REFERENCES "tax_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

