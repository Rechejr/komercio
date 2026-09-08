/**
 * Cierra los documentos de la bóveda que se subieron ANTES de que fueran
 * privados.
 *
 * Hasta este cambio, `uploadDocument` los subía públicos: bastaba tener el
 * enlace para abrir el RUT, la cámara de comercio o la declaración de renta de
 * un cliente del contador, sin iniciar sesión. El código nuevo ya sube privado,
 * pero los archivos viejos siguen abiertos hasta que se los pase por aquí.
 *
 * Qué hace con cada uno: lo renombra en Cloudinary de `upload` (público) a
 * `authenticated` (privado), y guarda en la base la URL firmada nueva junto con
 * el identificador del archivo.
 *
 * Uso:
 *   npx ts-node -r dotenv/config scripts/privatizarDocumentos.ts          (simulacro)
 *   npx ts-node -r dotenv/config scripts/privatizarDocumentos.ts --aplicar
 *
 * Contra producción hay que apuntar DATABASE_URL a la base de Railway.
 */
import { PrismaClient } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';

const prisma = new PrismaClient();
const APLICAR = process.argv.includes('--aplicar');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/** Saca el identificador del archivo de una URL pública de Cloudinary. */
function publicIdDesdeUrl(url: string): { publicId: string; resourceType: string } | null {
  // .../<resource_type>/upload/v123456/carpeta/archivo.ext
  const m = url.match(/\/(image|raw|video)\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
  if (!m) return null;
  return { resourceType: m[1], publicId: m[2] };
}

async function main() {
  if (!process.env.CLOUDINARY_API_SECRET) {
    console.error('Falta la configuración de Cloudinary.');
    process.exit(1);
  }

  const docs = await prisma.clientDocument.findMany({
    select: { id: true, nombre: true, url: true, publicId: true },
    orderBy: { createdAt: 'asc' },
  });

  const pendientes = docs.filter((d) => !d.url.includes('/authenticated/'));
  console.log(`Documentos en total: ${docs.length}`);
  console.log(`Ya privados: ${docs.length - pendientes.length}`);
  console.log(`Por cerrar:  ${pendientes.length}`);
  if (!APLICAR) {
    console.log('\nSIMULACRO: no se tocó nada. Agrega --aplicar para hacerlo de verdad.');
    pendientes.slice(0, 10).forEach((d) => console.log(`  - ${d.nombre}: ${d.url.slice(0, 80)}`));
    return;
  }

  let listos = 0;
  const fallos: string[] = [];

  for (const d of pendientes) {
    const info = d.publicId
      ? { publicId: d.publicId, resourceType: d.url.includes('/raw/') ? 'raw' : 'image' }
      : publicIdDesdeUrl(d.url);

    if (!info) {
      fallos.push(`${d.nombre} (${d.id}): no se pudo deducir el archivo desde la URL`);
      continue;
    }

    try {
      const r = await cloudinary.uploader.rename(info.publicId, info.publicId, {
        resource_type: info.resourceType,
        type: 'upload',
        to_type: 'authenticated',
        overwrite: true,
      });
      await prisma.clientDocument.update({
        where: { id: d.id },
        data: { url: r.secure_url, publicId: r.public_id, resourceType: r.resource_type || info.resourceType },
      });
      listos++;
      console.log(`  cerrado: ${d.nombre}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Si el archivo ya no está en Cloudinary no hay nada que cerrar: se anota
      // y se sigue, en vez de abortar la corrida entera por uno.
      fallos.push(`${d.nombre} (${d.id}): ${msg}`);
    }
  }

  console.log(`\nCerrados: ${listos} de ${pendientes.length}`);
  if (fallos.length) {
    console.log(`Con problema (${fallos.length}):`);
    fallos.forEach((f) => console.log('  x ' + f));
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
