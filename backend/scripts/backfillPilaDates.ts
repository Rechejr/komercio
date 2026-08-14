import 'dotenv/config';
import { prisma } from '../src/config/database';
import { periodosPila } from '../src/utils/pila';

// Corrige la fecha de los vencimientos de PILA ya generados: antes se calculaba
// en el MISMO mes del período; lo correcto es el mes SIGUIENTE (aportes de agosto
// vencen en septiembre). Recalcula por NIT + período. Idempotente: solo actualiza
// los que difieren. Correr en dev y en prod (bases distintas).
async function main() {
  const vencs = await prisma.vencimiento.findMany({
    where: { obligacion: 'pila' },
    select: { id: true, periodo: true, fecha: true, taxClient: { select: { nit: true } } },
  });

  let updated = 0;
  for (const v of vencs) {
    const nit = v.taxClient?.nit;
    const year = Number((v.periodo.match(/(\d{4})/) || [])[1]);
    if (!nit || !year) continue;
    const correct = periodosPila(nit, year).find((p) => p.periodo === v.periodo);
    if (!correct) continue;
    const newIso = correct.fecha.toISOString().slice(0, 10);
    const oldIso = new Date(v.fecha).toISOString().slice(0, 10);
    if (newIso !== oldIso) {
      await prisma.vencimiento.update({ where: { id: v.id }, data: { fecha: correct.fecha } });
      updated += 1;
    }
  }

  console.log(`PILA: ${updated} fecha(s) corregida(s) de ${vencs.length} vencimiento(s) revisados.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
