-- Fix: the bloque6 migration used ALTER TABLE...DROP CONSTRAINT which silently
-- did nothing because "sales_invoiceNumber_key" was a CREATE UNIQUE INDEX,
-- not a constraint. Properly drop it now so the global unique constraint
-- is replaced by the per-branch one already created by bloque6.
DROP INDEX IF EXISTS "sales_invoiceNumber_key";

-- Atomic invoice-number counter table.
-- Replaces pg_advisory_xact_lock which is unreliable with Neon's connection
-- pooling. INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING is guaranteed
-- atomic by PostgreSQL: concurrent inserts for the same (branchId, dayPrefix)
-- are serialized at the row level, eliminating invoice-number collisions.
CREATE TABLE IF NOT EXISTS "sale_number_counters" (
    "branchId"  TEXT NOT NULL,
    "dayPrefix" TEXT NOT NULL,
    "lastSeq"   INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "sale_number_counters_pkey" PRIMARY KEY ("branchId", "dayPrefix")
);