// Backfill de una sola vez: asigna el stock actual de cada producto (el total
// global de antes de esta función) a la bodega más antigua de su negocio, para
// que ProductStock arranque reflejando exactamente lo que ya existía.
//
// Debe correrse UNA vez por entorno, después de aplicar la migración de
// esquema y ANTES de desplegar el código que ya depende de ProductStock.
// Es idempotente: si un producto ya tiene una fila en esa bodega, no la toca
// (para no pisar movimiento real que haya ocurrido entre corridas).
//
// Uso:
//   npx ts-node prisma/backfillProductStock.ts --dry-run   (solo loguea, no escribe)
//   npx ts-node prisma/backfillProductStock.ts             (escribe de verdad)
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

async function main() {
  console.log(`Backfill de ProductStock — modo: ${dryRun ? 'DRY RUN (solo log)' : 'ESCRITURA REAL'}`);

  const businesses = await prisma.business.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });

  let productsProcessed = 0;
  let rowsCreated = 0;
  let rowsSkipped = 0;
  let businessesWithoutBranch = 0;

  for (const business of businesses) {
    const oldestBranch = await prisma.branch.findFirst({
      where: { businessId: business.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true },
    });

    if (!oldestBranch) {
      // No debería pasar — cada negocio tiene una bodega creada al registrarse —
      // pero se registra en vez de asumir, por si hay data vieja/manual rara.
      businessesWithoutBranch++;
      console.warn(`⚠️  Negocio "${business.name}" (${business.id}) no tiene ninguna bodega — se omite.`);
      continue;
    }

    const products = await prisma.product.findMany({
      where: { businessId: business.id, deletedAt: null },
      select: { id: true, name: true, stock: true },
    });

    for (const product of products) {
      productsProcessed++;
      const existing = await prisma.productStock.findUnique({
        where: { productId_branchId: { productId: product.id, branchId: oldestBranch.id } },
      });
      if (existing) {
        rowsSkipped++;
        continue;
      }

      if (dryRun) {
        console.log(`  [dry-run] crearía product_stocks: producto="${product.name}" bodega="${oldestBranch.name}" stock=${product.stock}`);
      } else {
        await prisma.productStock.create({
          data: { productId: product.id, branchId: oldestBranch.id, stock: product.stock },
        });
      }
      rowsCreated++;
    }
  }

  console.log('\n── Resumen ──');
  console.log(`Negocios revisados: ${businesses.length}`);
  console.log(`Negocios sin ninguna bodega (omitidos): ${businessesWithoutBranch}`);
  console.log(`Productos revisados: ${productsProcessed}`);
  console.log(`Filas de product_stocks ${dryRun ? 'que se crearían' : 'creadas'}: ${rowsCreated}`);
  console.log(`Filas ya existentes (sin tocar): ${rowsSkipped}`);
  if (dryRun) console.log('\nEsto fue un dry-run — no se escribió nada. Corre sin --dry-run para aplicar de verdad.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
