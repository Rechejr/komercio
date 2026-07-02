-- AlterTable: add monetary cost fields to inventory_movements for accounting ledger
ALTER TABLE "inventory_movements"
  ADD COLUMN IF NOT EXISTS "unitCost"  DECIMAL(65,30) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalCost" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- CreateIndex (customer document unique scoped by business — may already exist)
CREATE UNIQUE INDEX IF NOT EXISTS "customers_businessId_document_key"
  ON "customers"("businessId", "document");