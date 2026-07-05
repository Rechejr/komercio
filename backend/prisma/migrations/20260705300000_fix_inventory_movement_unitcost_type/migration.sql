-- Fix: bloque5 added unitCost and totalCost with ADD COLUMN IF NOT EXISTS,
-- but unitCost already existed (from the init migration as DOUBLE PRECISION NOT NULL).
-- The ADD COLUMN was silently skipped, leaving unitCost as DOUBLE PRECISION
-- while the Prisma schema expects Decimal(65,30).
-- totalCost was correctly added as DECIMAL(65,30) by bloque5.
ALTER TABLE "inventory_movements"
  ALTER COLUMN "unitCost" SET DATA TYPE DECIMAL(65,30),
  ALTER COLUMN "unitCost" SET DEFAULT 0;