-- ============================================================
-- Multi-tenant isolation: add businessId to all tenant-less
-- models (Customer, Supplier, Brand, Purchase, Expense,
-- ExpenseCategory, Product) and backfill existing rows.
-- ============================================================

-- 1. ADD COLUMNS (nullable so backfill can run before FK is enforced)
ALTER TABLE "customers"         ADD COLUMN "businessId" TEXT;
ALTER TABLE "suppliers"         ADD COLUMN "businessId" TEXT;
ALTER TABLE "brands"            ADD COLUMN "businessId" TEXT;
ALTER TABLE "purchases"         ADD COLUMN "businessId" TEXT;
ALTER TABLE "expenses"          ADD COLUMN "businessId" TEXT;
ALTER TABLE "expense_categories" ADD COLUMN "businessId" TEXT;
ALTER TABLE "products"          ADD COLUMN "businessId" TEXT;

-- 2. BACKFILL — assign every existing row to the first (only) business.
--    For products we try to derive businessId from their branch first.
DO $$
DECLARE first_biz TEXT;
BEGIN
  SELECT id INTO first_biz FROM businesses ORDER BY "createdAt" LIMIT 1;

  IF first_biz IS NOT NULL THEN
    UPDATE "customers"          SET "businessId" = first_biz WHERE "businessId" IS NULL;
    UPDATE "suppliers"          SET "businessId" = first_biz WHERE "businessId" IS NULL;
    UPDATE "brands"             SET "businessId" = first_biz WHERE "businessId" IS NULL;
    UPDATE "purchases"          SET "businessId" = first_biz WHERE "businessId" IS NULL;
    UPDATE "expenses"           SET "businessId" = first_biz WHERE "businessId" IS NULL;
    UPDATE "expense_categories" SET "businessId" = first_biz WHERE "businessId" IS NULL;

    -- Products: prefer branch.businessId, fall back to first_biz
    UPDATE "products" p
    SET "businessId" = COALESCE(
      (SELECT b."businessId" FROM branches b WHERE b.id = p."branchId"),
      first_biz
    )
    WHERE p."businessId" IS NULL;
  END IF;
END $$;

-- 3. DROP old global unique on customers.document (was @unique)
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_document_key";

-- 4. Composite partial unique: same document may exist in different businesses,
--    but not twice within the same business.
CREATE UNIQUE INDEX "customers_businessId_document_key"
  ON "customers" ("businessId", "document")
  WHERE "document" IS NOT NULL AND "businessId" IS NOT NULL;

-- 5. INDEXES for fast tenant-scoped queries
CREATE INDEX "customers_businessId_idx"          ON "customers"          ("businessId");
CREATE INDEX "suppliers_businessId_idx"          ON "suppliers"          ("businessId");
CREATE INDEX "brands_businessId_idx"             ON "brands"             ("businessId");
CREATE INDEX "purchases_businessId_idx"          ON "purchases"          ("businessId");
CREATE INDEX "expenses_businessId_idx"           ON "expenses"           ("businessId");
CREATE INDEX "expense_categories_businessId_idx" ON "expense_categories" ("businessId");
CREATE INDEX "products_businessId_idx"           ON "products"           ("businessId");

-- 6. FOREIGN KEY constraints (ON DELETE SET NULL so deleting a business
--    orphans records instead of cascading a mass delete)
ALTER TABLE "customers"
  ADD CONSTRAINT "customers_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "suppliers"
  ADD CONSTRAINT "suppliers_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "brands"
  ADD CONSTRAINT "brands_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "expense_categories"
  ADD CONSTRAINT "expense_categories_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "products"
  ADD CONSTRAINT "products_businessId_fkey"
  FOREIGN KEY ("businessId") REFERENCES "businesses"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;