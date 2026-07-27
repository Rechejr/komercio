-- Sembrado + backfill de medios de pago, IDEMPOTENTE, como migración para que
-- corra atómicamente en el mismo `migrate deploy` que crea la tabla — así no hay
-- ventana en la que un negocio existente quede con cero medios de pago (lo que
-- rompería el POS). Las guardas NOT EXISTS / IS NULL lo hacen no-op si ya corrió
-- (p. ej. en dev, donde el backfill se corrió antes con el script equivalente).

-- 1. Sembrar 5 medios por cada negocio POS activo que no tenga ninguno.
INSERT INTO payment_accounts (id, "businessId", name, type, "legacyEnum", active, "order", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b.id, x.name, x.type::"PaymentAccountType", x.le::"PaymentMethod", true, x.ord, now(), now()
FROM businesses b
CROSS JOIN (VALUES
  ('Efectivo',      'CASH',  'CASH',      0),
  ('Transferencia', 'BANK',  'TRANSFER',  1),
  ('Nequi',         'OTHER', 'NEQUI',     2),
  ('Daviplata',     'OTHER', 'DAVIPLATA', 3),
  ('Tarjeta',       'BANK',  'CARD',      4)
) AS x(name, type, le, ord)
WHERE b.type = 'pos' AND b."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM payment_accounts pa WHERE pa."businessId" = b.id);

-- 2. Re-apuntar ventas/compras/gastos/abonos existentes según el enum viejo.
--    Las ventas MIXTAS se dejan (su desglose vive en paymentDetails).
UPDATE sales s SET "paymentAccountId" = pa.id
FROM branches b, payment_accounts pa
WHERE s."branchId" = b.id AND pa."businessId" = b."businessId"
  AND pa."legacyEnum" = s."paymentMethod" AND s."paymentMethod" <> 'MIXED' AND s."paymentAccountId" IS NULL;

UPDATE purchases p SET "paymentAccountId" = pa.id
FROM payment_accounts pa
WHERE pa."businessId" = p."businessId" AND pa."legacyEnum" = p."paymentMethod" AND p."paymentAccountId" IS NULL;

UPDATE expenses e SET "paymentAccountId" = pa.id
FROM payment_accounts pa
WHERE pa."businessId" = e."businessId" AND pa."legacyEnum" = e."paymentMethod" AND e."paymentAccountId" IS NULL;

UPDATE credit_payments cp SET "paymentAccountId" = pa.id
FROM credits c, customers cu, payment_accounts pa
WHERE cp."creditId" = c.id AND c."customerId" = cu.id
  AND pa."businessId" = cu."businessId" AND pa."legacyEnum" = cp."paymentMethod" AND cp."paymentAccountId" IS NULL;
