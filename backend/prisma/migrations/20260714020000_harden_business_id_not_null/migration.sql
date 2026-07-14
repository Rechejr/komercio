-- Endurece businessId a NOT NULL en las tablas donde el backfill de
-- aislamiento multi-tenant (20260630185247_add_tenant_isolation) ya corrió.
-- IMPORTANTE: esta migración FALLARÁ si existe alguna fila con businessId NULL
-- en estas tablas — antes de aplicarla en un ambiente nuevo (ej. producción),
-- verificar primero con:
--   SELECT count(*) FROM categories WHERE "businessId" IS NULL;
--   SELECT count(*) FROM brands WHERE "businessId" IS NULL;
--   SELECT count(*) FROM customers WHERE "businessId" IS NULL;
--   SELECT count(*) FROM suppliers WHERE "businessId" IS NULL;
--   SELECT count(*) FROM products WHERE "businessId" IS NULL;
--   SELECT count(*) FROM purchases WHERE "businessId" IS NULL;
-- Si alguna da > 0, investigar esas filas (no son alcanzables por ningún
-- negocio real) antes de decidir si se eliminan o se reasignan.

ALTER TABLE "categories" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "brands" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "customers" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "suppliers" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "products" ALTER COLUMN "businessId" SET NOT NULL;
ALTER TABLE "purchases" ALTER COLUMN "businessId" SET NOT NULL;
