-- Prevent two open cash registers for the same branch simultaneously.
-- A standard @@unique doesn't support partial indexes, so this is done in raw SQL.
-- The WHERE clause means the constraint only applies to rows where status = 'OPEN',
-- so a branch can have multiple CLOSED registers in history (correct behavior).
CREATE UNIQUE INDEX "cash_registers_branch_open_unique"
  ON "cash_registers" ("branchId")
  WHERE status = 'OPEN';
