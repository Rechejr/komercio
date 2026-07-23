/**
 * Respaldo manual de la base de datos.
 *
 *   npm run db:backup            respalda la base de DATABASE_URL
 *   npm run db:backup -- --check solo verifica que todo esté listo, sin volcar
 *
 * Genera un archivo con marca de tiempo en backups/ (ignorado por git). El
 * formato es el "custom" de PostgreSQL (-Fc): va comprimido y permite restaurar
 * tablas sueltas con pg_restore, no solo la base completa.
 *
 * IMPORTANTE — esto NO reemplaza el point-in-time restore de Neon, lo
 * complementa. Neon cubre el caso "borré algo por error hace dos horas". Este
 * volcado cubre el caso que Neon no puede cubrir: perder el acceso a la cuenta,
 * que el plan se degrade y se pierda el historial, o que el proyecto se elimine.
 * Un respaldo que vive en el mismo lugar que el original no es un respaldo.
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import { join } from 'path';
import 'dotenv/config';

const CHECK_ONLY = process.argv.includes('--check');
const BACKUP_DIR = join(__dirname, '..', '..', 'backups');

function fail(msg: string, hint?: string): never {
  console.error(`\n✖ ${msg}`);
  if (hint) console.error(`\n  ${hint}\n`);
  process.exit(1);
}

/**
 * Neon expone dos endpoints: uno agrupado (`-pooler`) y uno directo. pg_dump
 * necesita el directo — el pooler es PgBouncer en modo transacción y no soporta
 * las sentencias que pg_dump usa para volcar el esquema, así que falla o
 * produce un respaldo incompleto. Se quita el sufijo si está presente.
 */
function toDirectUrl(url: string): { url: string; wasPooled: boolean } {
  const wasPooled = url.includes('-pooler.');
  return { url: wasPooled ? url.replace('-pooler.', '.') : url, wasPooled };
}

function checkPgDump(): string {
  const probe = spawnSync('pg_dump', ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) {
    fail(
      'No se encontró pg_dump en el sistema.',
      'Instala las herramientas cliente de PostgreSQL:\n' +
        '  Windows: https://www.postgresql.org/download/windows/ (basta con "Command Line Tools")\n' +
        '  Mac:     brew install libpq && brew link --force libpq\n' +
        '  Linux:   sudo apt install postgresql-client',
    );
  }
  return (probe.stdout || '').trim();
}

function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail('DATABASE_URL no está definida.', 'Revisa el archivo backend/.env');

  const version = checkPgDump();
  const { url, wasPooled } = toDirectUrl(raw);

  // Se muestra solo el host: la cadena lleva usuario y contraseña.
  const host = url.match(/@([^/]+)\//)?.[1] ?? 'desconocido';

  console.log(`\n${version}`);
  console.log(`Servidor : ${host}`);
  if (wasPooled) {
    console.log('           (se usó el endpoint directo, no el pooler — pg_dump lo requiere)');
  }

  if (CHECK_ONLY) {
    console.log('\n✔ Todo listo para respaldar. Ejecuta "npm run db:backup" sin --check.\n');
    return;
  }

  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });

  // Marca de tiempo ordenable alfabéticamente: ventrix-2026-07-23_1610.dump
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}` +
    `_${p(now.getHours())}${p(now.getMinutes())}`;
  const outFile = join(BACKUP_DIR, `ventrix-${stamp}.dump`);

  console.log(`Destino  : ${outFile}\n`);
  console.log('Respaldando… (puede tardar según el tamaño de la base)');

  const result = spawnSync(
    'pg_dump',
    [
      url,
      '--format=custom', // comprimido y restaurable por partes con pg_restore
      '--no-owner', // restaurable en otra cuenta sin errores de permisos
      '--no-acl',
      '--file', outFile,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'inherit', 'pipe'] },
  );

  if (result.status !== 0) {
    fail(`pg_dump falló:\n${result.stderr?.trim() ?? '(sin detalle)'}`);
  }

  const mb = (statSync(outFile).size / 1024 / 1024).toFixed(2);
  console.log(`\n✔ Respaldo completo: ${outFile} (${mb} MB)`);
  console.log('\n  Guarda una copia FUERA de esta máquina (disco externo o nube).');
  console.log('  Un respaldo que vive junto al original no protege de nada.');
  console.log('\n  Para restaurar en una base vacía:');
  console.log(`    pg_restore --no-owner --no-acl -d "<URL_DESTINO>" "${outFile}"\n`);
}

main();
