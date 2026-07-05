-- Add @@unique([businessId, name]) to Brand and ExpenseCategory
-- Step 1: Remove duplicates keeping the oldest row per (businessId, name) pair
DELETE FROM "expense_categories"
WHERE id NOT IN (
  SELECT DISTINCT ON ("businessId", name) id
  FROM "expense_categories"
  ORDER BY "businessId", name, "createdAt" ASC
);

DELETE FROM "brands"
WHERE id NOT IN (
  SELECT DISTINCT ON ("businessId", name) id
  FROM "brands"
  ORDER BY "businessId", name, "createdAt" ASC
);

-- Step 2: Create unique indexes
CREATE UNIQUE INDEX "brands_businessId_name_key" ON "brands"("businessId", "name");
CREATE UNIQUE INDEX "expense_categories_businessId_name_key" ON "expense_categories"("businessId", "name");