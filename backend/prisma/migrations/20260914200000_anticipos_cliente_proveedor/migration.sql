-- Anticipos de cliente y de proveedor.
--
-- Solo crea lo nuevo: el diff automático arrastraba diferencias viejas entre la
-- base de desarrollo y el esquema (claves foráneas de otras tablas) que no
-- tienen nada que ver con esta función y no deben tocarse en producción.

CREATE TYPE "AdvanceType" AS ENUM ('CUSTOMER', 'SUPPLIER');
CREATE TYPE "AdvanceStatus" AS ENUM ('PENDING', 'PARTIAL', 'APPLIED', 'REFUNDED', 'CANCELLED');

CREATE TABLE "advances" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "type" "AdvanceType" NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "applied" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balance" DECIMAL(65,30) NOT NULL,
    "status" "AdvanceStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentAccountId" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundMethod" "PaymentMethod",
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "advance_applications" (
    "id" TEXT NOT NULL,
    "advanceId" TEXT NOT NULL,
    "saleId" TEXT,
    "purchaseId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advance_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "advances_businessId_number_key" ON "advances"("businessId", "number");
CREATE INDEX "advances_businessId_type_status_idx" ON "advances"("businessId", "type", "status");
CREATE INDEX "advances_customerId_idx" ON "advances"("customerId");
CREATE INDEX "advances_supplierId_idx" ON "advances"("supplierId");
CREATE INDEX "advances_createdAt_idx" ON "advances"("createdAt");
CREATE INDEX "advance_applications_advanceId_idx" ON "advance_applications"("advanceId");
CREATE INDEX "advance_applications_saleId_idx" ON "advance_applications"("saleId");
CREATE INDEX "advance_applications_purchaseId_idx" ON "advance_applications"("purchaseId");

ALTER TABLE "advances" ADD CONSTRAINT "advances_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "advances" ADD CONSTRAINT "advances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "advances" ADD CONSTRAINT "advances_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "advances" ADD CONSTRAINT "advances_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "advances" ADD CONSTRAINT "advances_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "advances" ADD CONSTRAINT "advances_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "advance_applications" ADD CONSTRAINT "advance_applications_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "advances"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "advance_applications" ADD CONSTRAINT "advance_applications_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "advance_applications" ADD CONSTRAINT "advance_applications_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
