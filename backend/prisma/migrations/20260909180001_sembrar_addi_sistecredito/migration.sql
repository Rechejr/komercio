-- Deja Addi y Sistecrédito listos en los negocios que YA existen (los nuevos los
-- reciben al registrarse). Quien no las use puede desactivarlas desde
-- Configuración → Medios de pago; no estorban más allá de un botón.
--
-- Va en migración aparte de la que crea el valor del enum: Postgres no deja usar
-- un valor de enum recién agregado dentro de la misma transacción.
--
-- Solo negocios POS: una oficina contable no vende con financiación. Y solo si
-- no lo tiene ya, para que correrla dos veces no duplique nada.

INSERT INTO "payment_accounts" ("id", "businessId", "name", "type", "legacyEnum", "active", "order", "createdAt", "updatedAt")
SELECT gen_random_uuid(), b."id", v.nombre, 'FINANCING'::"PaymentAccountType", 'TRANSFER'::"PaymentMethod", true, v.orden, NOW(), NOW()
  FROM "businesses" b
 CROSS JOIN (VALUES ('Addi', 5), ('Sistecrédito', 6)) AS v(nombre, orden)
 WHERE b."type" = 'pos'
   AND b."deletedAt" IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM "payment_accounts" pa
      WHERE pa."businessId" = b."id" AND lower(pa."name") = lower(v.nombre)
   );
