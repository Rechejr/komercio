-- BLOQUE 4: Float → Decimal for all monetary fields, composite unique for Product.code,
-- barcode index scoped by businessId, and missing indexes for query performance.
-- Generated with: npx prisma migrate diff --from-schema-datasource --to-schema-datamodel --script

-- DropIndex
DROP INDEX IF EXISTS "products_barcode_idx";

-- DropIndex
DROP INDEX IF EXISTS "products_barcode_key";

-- DropIndex
DROP INDEX IF EXISTS "products_code_idx";

-- DropIndex
DROP INDEX IF EXISTS "products_code_key";

-- AlterTable: Float → DECIMAL for all monetary fields in businesses
ALTER TABLE "businesses" ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for cash_movements.amount
ALTER TABLE "cash_movements" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for cash_registers monetary fields
ALTER TABLE "cash_registers"
  ALTER COLUMN "openingAmount" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "closingAmount" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "expectedAmount" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "difference" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for credit_payments.amount
ALTER TABLE "credit_payments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for credits monetary fields
ALTER TABLE "credits"
  ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "balance" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for customers monetary fields
ALTER TABLE "customers"
  ALTER COLUMN "creditLimit" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "currentDebt" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for expenses.amount
ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for products price/rate fields
-- Note: stock and minStock remain DOUBLE PRECISION (inventory quantities, not monetary)
ALTER TABLE "products"
  ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "salePrice" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "wholesalePrice" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for purchase_details monetary fields
-- Note: quantity remains DOUBLE PRECISION
ALTER TABLE "purchase_details"
  ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "total" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for purchases monetary fields
ALTER TABLE "purchases"
  ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "total" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for sale_details monetary fields
-- Note: quantity remains DOUBLE PRECISION
ALTER TABLE "sale_details"
  ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "costPrice" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "discountPct" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "taxRate" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "total" SET DATA TYPE DECIMAL(65,30);

-- AlterTable: Float → DECIMAL for sales monetary fields
ALTER TABLE "sales"
  ALTER COLUMN "subtotal" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "taxAmount" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "discountAmount" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "total" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "changeAmount" SET DATA TYPE DECIMAL(65,30);

-- CreateIndex: composite unique replaces global unique for Product.code
CREATE UNIQUE INDEX IF NOT EXISTS "products_businessId_code_key" ON "products"("businessId", "code");

-- CreateIndex: barcode lookup now scoped by business
CREATE INDEX IF NOT EXISTS "products_businessId_barcode_idx" ON "products"("businessId", "barcode");

-- CreateIndex: product name search within a business
CREATE INDEX IF NOT EXISTS "products_businessId_name_idx" ON "products"("businessId", "name");

-- CreateIndex: filter active products within a business
CREATE INDEX IF NOT EXISTS "products_businessId_isActive_idx" ON "products"("businessId", "isActive");

-- CreateIndex: purchase date range queries per business
CREATE INDEX IF NOT EXISTS "purchases_businessId_purchaseDate_idx" ON "purchases"("businessId", "purchaseDate");

-- CreateIndex: expense date range queries per business
CREATE INDEX IF NOT EXISTS "expenses_businessId_date_idx" ON "expenses"("businessId", "date");

-- CreateIndex: customer name search within a business
CREATE INDEX IF NOT EXISTS "customers_businessId_name_idx" ON "customers"("businessId", "name");

-- CreateIndex: inventory movement lookup by reference (sale/purchase id)
CREATE INDEX IF NOT EXISTS "inventory_movements_referenceId_idx" ON "inventory_movements"("referenceId");

-- CreateIndex: time-series inventory movements per product
CREATE INDEX IF NOT EXISTS "inventory_movements_productId_createdAt_idx" ON "inventory_movements"("productId", "createdAt");

-- CreateIndex: unread notification queries
CREATE INDEX IF NOT EXISTS "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex: audit trail lookup by entity
CREATE INDEX IF NOT EXISTS "audit_logs_entityId_idx" ON "audit_logs"("entityId");

-- CreateIndex: RefreshToken cleanup by user + expiry (efficient per-user cleanup on login)
CREATE INDEX IF NOT EXISTS "refresh_tokens_userId_expiresAt_idx" ON "refresh_tokens"("userId", "expiresAt");

-- CreateIndex: RefreshToken global cleanup by expiry
CREATE INDEX IF NOT EXISTS "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex: customers unique document per business (may already exist)
CREATE UNIQUE INDEX IF NOT EXISTS "customers_businessId_document_key" ON "customers"("businessId", "document");

-- RenameIndex: normalize googleId casing in index name (safe — Prisma uses the new name)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'users_googleid_key') THEN
    ALTER INDEX "users_googleid_key" RENAME TO "users_googleId_key";
  END IF;
END $$;