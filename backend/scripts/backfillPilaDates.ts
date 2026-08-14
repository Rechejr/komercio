import 'dotenv/config';
import { prisma } from '../src/config/database';
import { fixPilaDates } from '../src/config/fixPilaDates';

// Corrige la fecha de los vencimientos de PILA ya generados: antes se calculaba
// en el MISMO mes del período; lo correcto es el mes SIGUIENTE (aportes de agosto
// vencen en septiembre). Desde el fix esto también corre solo al arrancar el
// servidor (config/fixPilaDates.ts); este script queda para poder aplicarlo a
// mano contra una base concreta. Idempotente y respeta las fechas editadas.
async function main() {
  const updated = await fixPilaDates();
  console.log(`PILA: ${updated} fecha(s) corregida(s).`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
