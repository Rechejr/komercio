import 'dotenv/config';
import { prisma } from '../src/config/database';
import { calcularDV, nitConDvPegado, ultimoDigito, dosUltimosDigitos } from '../src/utils/nit';
import { periodosPila } from '../src/utils/pila';
import { periodosExogena } from '../src/utils/exogena';

// Repara los clientes que quedaron guardados con el DÍGITO DE VERIFICACIÓN metido
// dentro del NIT ("900123456-7" → 9001234567), y —lo importante— corrige las
// fechas de su agenda: el calendario DIAN se asigna por el último dígito del NIT,
// así que esos clientes tienen vencimientos hasta dos semanas corridos.
//
// Debe correrse UNA vez por entorno (dev y prod son bases distintas).
//
// Uso:
//   npm run db:fix-nit-dv              → DIAGNÓSTICO: solo informa, no escribe nada
//   npm run db:fix-nit-dv -- --apply   → aplica los cambios
//
// Es conservador por diseño, en tres puntos:
//   1. Solo corrige NITs donde el DV pegado es inequívoco (ver `dvPegado`).
//   2. Una fecha solo se mueve si coincide EXACTAMENTE con la que daba el dígito
//      equivocado. Si el contador la editó a mano, se respeta (mismo criterio que
//      config/fixPilaDates.ts).
//   3. Si el NIT corregido ya existe en esa oficina, no toca nada y lo reporta:
//      es un cliente duplicado y hay que decidir a mano cuál se queda.

const APPLY = process.argv.includes('--apply');
const ANIO = Number(process.env.ANIO_CALENDARIO) || 2026;

const isoDay = (d: Date | string): string => new Date(d).toISOString().slice(0, 10);

/** Igual que varianteDe() del controlador: IVA va por periodicidad, renta por
 *  tipo de persona, el resto no tiene variante. */
function varianteDe(obligacion: string, tipoPersona: string, ivaPeriodicidad: string | null): string | null {
  if (obligacion === 'iva') return ivaPeriodicidad;
  if (obligacion === 'renta') return tipoPersona;
  return null;
}

type Cliente = {
  id: string; nit: string; razonSocial: string; businessId: string;
  tipoPersona: string; ivaPeriodicidad: string | null;
};

async function main() {
  console.log(`\nNIT con DV pegado — modo: ${APPLY ? 'APLICAR CAMBIOS' : 'DIAGNÓSTICO (no escribe nada)'}`);
  console.log(`Calendario del año ${ANIO}\n`);

  const clientes = await prisma.taxClient.findMany({
    select: { id: true, nit: true, razonSocial: true, businessId: true, tipoPersona: true, ivaPeriodicidad: true },
  });

  const afectados: { c: Cliente; nitBueno: string }[] = [];
  const dudosos: Cliente[] = [];

  for (const c of clientes) {
    const nitBueno = nitConDvPegado(c.nit);
    if (nitBueno) { afectados.push({ c, nitBueno }); continue; }
    // El DV cuadra pero la longitud no delata nada: puede ser un número legítimo.
    // No se toca; se lista para que lo revise una persona.
    const cuerpo = c.nit.slice(0, -1);
    if (cuerpo && /^\d+$/.test(c.nit) && calcularDV(cuerpo) === Number(c.nit.slice(-1))) dudosos.push(c);
  }

  console.log(`Clientes en la base: ${clientes.length}`);
  console.log(`Con el DV pegado (inequívoco): ${afectados.length}`);
  console.log(`Dudosos (no se tocan): ${dudosos.length}\n`);

  if (afectados.length === 0) {
    console.log('No hay nada que corregir.');
    if (dudosos.length > 0) listarDudosos(dudosos);
    return;
  }

  // Calendario del año, cargado una vez.
  const dianRows = await prisma.calendarioDian.findMany({
    where: { anio: ANIO },
    select: { obligacion: true, variante: true, digito: true, periodo: true, fecha: true },
  });
  const dianMap = new Map<string, Date>();
  for (const r of dianRows) {
    dianMap.set(`${r.obligacion}|${r.variante ?? ''}|${r.digito}|${r.periodo}`, r.fecha);
  }
  const rentaNatRows = await prisma.calendarioRentaNatural.findMany({
    where: { anio: ANIO }, select: { dosDigitos: true, fecha: true },
  });
  const rentaNatMap = new Map<number, Date>(rentaNatRows.map((r) => [r.dosDigitos, r.fecha]));

  /** Fecha que le correspondería a un vencimiento si el cliente tuviera `nit`.
   *  null = esa obligación no depende del NIT (ICA) o no está en el calendario. */
  function fechaSegunNit(
    c: Cliente, nit: string, obligacion: string, periodo: string,
  ): Date | null {
    if (obligacion === 'pila') {
      const anio = Number((periodo.match(/(\d{4})/) || [])[1]) || ANIO;
      return periodosPila(nit, anio).find((p) => p.periodo === periodo)?.fecha ?? null;
    }
    if (obligacion === 'exogena') {
      const anio = Number((periodo.match(/(\d{4})/) || [])[1]) || ANIO;
      return periodosExogena(nit, anio).find((p) => p.periodo === periodo)?.fecha ?? null;
    }
    if (obligacion === 'renta' && c.tipoPersona === 'natural') {
      return rentaNatMap.get(dosUltimosDigitos(nit)) ?? null;
    }
    const variante = varianteDe(obligacion, c.tipoPersona, c.ivaPeriodicidad);
    return dianMap.get(`${obligacion}|${variante ?? ''}|${ultimoDigito(nit)}|${periodo}`) ?? null;
  }

  let clientesCorregidos = 0;
  let fechasMovidas = 0;
  let fechasRespetadas = 0;
  const colisiones: { c: Cliente; nitBueno: string }[] = [];
  let desvioMax = 0;

  for (const { c, nitBueno } of afectados) {
    // ¿Ya existe otro cliente con el NIT bueno en la misma oficina?
    const choca = await prisma.taxClient.findFirst({
      where: { businessId: c.businessId, nit: nitBueno, id: { not: c.id } },
      select: { id: true, razonSocial: true },
    });
    if (choca) {
      colisiones.push({ c, nitBueno });
      continue;
    }

    const vencs = await prisma.vencimiento.findMany({
      where: { taxClientId: c.id },
      select: { id: true, obligacion: true, periodo: true, fecha: true },
    });

    const porMover: { id: string; de: Date; a: Date }[] = [];
    let respetadasAqui = 0;

    for (const v of vencs) {
      const conNitMalo = fechaSegunNit(c, c.nit, v.obligacion, v.periodo);
      const conNitBueno = fechaSegunNit(c, nitBueno, v.obligacion, v.periodo);
      if (!conNitBueno || !conNitMalo) continue;              // no depende del NIT
      if (isoDay(conNitMalo) === isoDay(conNitBueno)) continue; // el dígito daba igual
      if (isoDay(v.fecha) !== isoDay(conNitMalo)) { respetadasAqui++; continue; } // editada a mano
      porMover.push({ id: v.id, de: v.fecha, a: conNitBueno });
    }

    for (const m of porMover) {
      const dias = Math.round((new Date(m.de).getTime() - new Date(m.a).getTime()) / 86400000);
      if (Math.abs(dias) > Math.abs(desvioMax)) desvioMax = dias;
    }

    const señal = porMover.some((m) => new Date(m.de) > new Date(m.a)) ? '  ⚠ tenía fechas MÁS TARDE de lo real' : '';
    console.log(`· ${c.razonSocial}`);
    console.log(`    NIT ${c.nit} → ${nitBueno}-${calcularDV(nitBueno)}`);
    console.log(`    vencimientos a corregir: ${porMover.length}${respetadasAqui ? `, editados a mano que se respetan: ${respetadasAqui}` : ''}${señal}`);

    fechasMovidas += porMover.length;
    fechasRespetadas += respetadasAqui;
    clientesCorregidos++;

    if (APPLY) {
      await prisma.$transaction([
        prisma.taxClient.update({
          where: { id: c.id },
          data: { nit: nitBueno, dv: calcularDV(nitBueno) },
        }),
        ...porMover.map((m) =>
          prisma.vencimiento.update({ where: { id: m.id }, data: { fecha: m.a } }),
        ),
      ]);
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Clientes ${APPLY ? 'corregidos' : 'por corregir'}: ${clientesCorregidos}`);
  console.log(`Fechas de vencimiento ${APPLY ? 'movidas' : 'por mover'}: ${fechasMovidas}`);
  if (fechasRespetadas) console.log(`Fechas editadas a mano que NO se tocan: ${fechasRespetadas}`);
  if (desvioMax) console.log(`Desvío más grande encontrado: ${Math.abs(desvioMax)} día(s)`);

  if (colisiones.length) {
    console.log(`\n⚠ ${colisiones.length} cliente(s) NO se tocaron: el NIT corregido ya existe en esa oficina.`);
    console.log('  Son duplicados (el mismo cliente entró dos veces, con y sin DV). Hay que');
    console.log('  decidir a mano cuál se queda y borrar el otro:');
    for (const { c, nitBueno } of colisiones) {
      console.log(`   · ${c.razonSocial} — ${c.nit} chocaría con ${nitBueno}`);
    }
  }

  if (dudosos.length) listarDudosos(dudosos);

  if (!APPLY && clientesCorregidos > 0) {
    console.log('\nEsto fue solo el diagnóstico. Para aplicarlo:');
    console.log('   npm run db:fix-nit-dv -- --apply\n');
  }
}

function listarDudosos(dudosos: Cliente[]) {
  console.log(`\nℹ ${dudosos.length} cliente(s) donde el DV cuadra pero el número parece legítimo.`);
  console.log('  No se tocan (podrían ser cédulas correctas). Revísalos contra el RUT si quieres:');
  for (const c of dudosos.slice(0, 20)) console.log(`   · ${c.razonSocial} — ${c.nit}`);
  if (dudosos.length > 20) console.log(`   … y ${dudosos.length - 20} más`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
