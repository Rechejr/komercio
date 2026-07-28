-- Variantes de producto (ropa: tallas/colores). Migración puramente ADITIVA:
-- nuevas tablas + columnas nullable/con default. Los productos simples no se
-- tocan (hasVariants default false; sin filas en las tablas nuevas) → cero
-- cambio para los clientes actuales.

-- AlterTable
ALTER TABLE "products" ADD COLUMN "hasVariants" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sale_details" ADD COLUMN "productVariantId" TEXT;
ALTER TABLE "purchase_details" ADD COLUMN "productVariantId" TEXT;

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "talla" TEXT,
    "color" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_variant_stocks" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variant_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");
CREATE INDEX "product_variant_stocks_branchId_idx" ON "product_variant_stocks"("branchId");
CREATE UNIQUE INDEX "product_variant_stocks_variantId_branchId_key" ON "product_variant_stocks"("variantId", "branchId");
CREATE INDEX "sale_details_productVariantId_idx" ON "sale_details"("productVariantId");
CREATE INDEX "purchase_details_productVariantId_idx" ON "purchase_details"("productVariantId");

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variant_stocks" ADD CONSTRAINT "product_variant_stocks_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_variant_stocks" ADD CONSTRAINT "product_variant_stocks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_details" ADD CONSTRAINT "sale_details_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
