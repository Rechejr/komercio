-- BLOQUE 6 — Performance: per-branch invoice uniqueness + missing indexes

-- Replace global invoice uniqueness with per-branch uniqueness.
-- Each branch now maintains its own daily sequence independently,
-- eliminating the global pg_advisory_xact_lock that serialized all businesses.
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_invoiceNumber_key";
CREATE UNIQUE INDEX IF NOT EXISTS "sales_branchId_invoiceNumber_key"
  ON "sales"("branchId", "invoiceNumber");

-- Auth token lookups: avoids full-table scan on password reset and email verify flows
CREATE INDEX IF NOT EXISTS "users_emailVerifyToken_idx"
  ON "users"("emailVerifyToken") WHERE "emailVerifyToken" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "users_resetPasswordToken_idx"
  ON "users"("resetPasswordToken") WHERE "resetPasswordToken" IS NOT NULL;

-- Credit overdue detection: speeds up the updateMany in GET /credits
-- and any future cron that marks credits as OVERDUE
CREATE INDEX IF NOT EXISTS "credits_dueDate_idx"
  ON "credits"("dueDate") WHERE "dueDate" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "credits_status_dueDate_idx"
  ON "credits"("status", "dueDate") WHERE "dueDate" IS NOT NULL;

-- Dashboard: customer debt count query (currentDebt > 0 filter)
CREATE INDEX IF NOT EXISTS "customers_businessId_currentDebt_idx"
  ON "customers"("businessId", "currentDebt");