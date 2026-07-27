/**
 * Backfill de medios de pago (PaymentAccount).
 *
 * 1. Siembra 5 medios por cada negocio POS que no tenga ninguno: Efectivo,
 *    Transferencia, Nequi, Daviplata, Tarjeta — con su tipo (solo Efectivo es
 *    CASH → alimenta la caja física) y su `legacyEnum` (puente con el enum viejo).
 * 2. Re-apunta las ventas/compras/gastos/abonos existentes a su medio según el
 *    enum viejo (las ventas MIXTAS se dejan en null: su desglose vive en
 *    paymentDetails y se migrará en la Fase 3).
 *
 * Idempotente: se puede correr varias veces sin duplicar (siembra con NOT EXISTS,
 * backfill solo donde paymentAccountId IS NULL). Correr en dev y luego en prod.
 *
 *   npm run db:backfill-payment-accounts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // 1. Siembra (solo negocios POS activos sin medios). gen_random_uuid() es nativo
  //    en Postgres 13+. legacyEnum mapea 1:1 al enum viejo para no romper reportes.
  const sembrados = await prisma.$executeRawUnsafe(`
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
      AND NOT EXISTS (SELECT 1 FROM payment_accounts pa WHERE pa."businessId" = b.id)
  `);
  console.log(`Medios sembrados (filas insertadas): ${sembrados}`);

  // 2. Backfill. Cada tabla apunta a su negocio de forma distinta.
  const ventas = await prisma.$executeRawUnsafe(`
    UPDATE sales s SET "paymentAccountId" = pa.id
    FROM branches b, payment_accounts pa
    WHERE s."branchId" = b.id AND pa."businessId" = b."businessId"
      AND pa."legacyEnum" = s."paymentMethod"
      AND s."paymentMethod" <> 'MIXED' AND s."paymentAccountId" IS NULL
  `);
  console.log(`Ventas re-apuntadas: ${ventas}`);

  const compras = await prisma.$executeRawUnsafe(`
    UPDATE purchases p SET "paymentAccountId" = pa.id
    FROM payment_accounts pa
    WHERE pa."businessId" = p."businessId" AND pa."legacyEnum" = p."paymentMethod"
      AND p."paymentAccountId" IS NULL
  `);
  console.log(`Compras re-apuntadas: ${compras}`);

  const gastos = await prisma.$executeRawUnsafe(`
    UPDATE expenses e SET "paymentAccountId" = pa.id
    FROM payment_accounts pa
    WHERE pa."businessId" = e."businessId" AND pa."legacyEnum" = e."paymentMethod"
      AND e."paymentAccountId" IS NULL
  `);
  console.log(`Gastos re-apuntados: ${gastos}`);

  const abonos = await prisma.$executeRawUnsafe(`
    UPDATE credit_payments cp SET "paymentAccountId" = pa.id
    FROM credits c, customers cu, payment_accounts pa
    WHERE cp."creditId" = c.id AND c."customerId" = cu.id
      AND pa."businessId" = cu."businessId" AND pa."legacyEnum" = cp."paymentMethod"
      AND cp."paymentAccountId" IS NULL
  `);
  console.log(`Abonos de crédito re-apuntados: ${abonos}`);

  // 3. Verificación: cuántos registros quedaron SIN medio (deberían ser solo las
  //    ventas MIXTAS y los gastos sin businessId).
  const [{ ventas_sin }] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS ventas_sin FROM sales WHERE "paymentAccountId" IS NULL AND "paymentMethod" <> 'MIXED'`,
  );
  const [{ mixtas }] = await prisma.$queryRawUnsafe<any[]>(
    `SELECT count(*)::int AS mixtas FROM sales WHERE "paymentMethod" = 'MIXED'`,
  );
  console.log(`\nVerificación → ventas no-MIXTAS sin medio (debería ser 0): ${ventas_sin}`);
  console.log(`Ventas MIXTAS (se dejan sin medio a propósito, Fase 3): ${mixtas}`);
}

main()
  .then(() => console.log('\n✅ Backfill de medios de pago completado.'))
  .catch((e) => { console.error('❌ Error en el backfill:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
