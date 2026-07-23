import fs from 'fs';
import path from 'path';

/**
 * Credenciales de las pruebas end-to-end.
 *
 * Antes estaban escritas directamente en el código, en un repositorio público:
 * cualquiera podía leer el usuario y la contraseña de un administrador real.
 * Ahora se leen del entorno y nunca se versionan.
 *
 * Configuración: copiar `.env.example` a `.env` dentro de `e2e/` y llenarlo.
 * Ese archivo está ignorado por git.
 */

let loaded = false;

/**
 * Carga e2e/.env a process.env.
 *
 * Se implementa a mano en lugar de usar dotenv porque el proyecto e2e solo
 * depende de Playwright, y no vale la pena sumar una dependencia (ni tocar su
 * lock file) por diez líneas. No sobrescribe variables que ya vengan del
 * entorno, para que CI pueda inyectarlas por secretos.
 */
function loadEnvFile(): void {
  if (loaded) return;
  loaded = true;

  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    // Se quitan comillas envolventes si las hay.
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');

    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function required(name: string): string {
  loadEnvFile();
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno ${name}.\n\n` +
        `Las pruebas e2e ya no llevan credenciales escritas en el código.\n` +
        `Copia e2e/.env.example a e2e/.env y complétalo, o exporta la variable\n` +
        `antes de ejecutar las pruebas.`,
    );
  }
  return value;
}

/** Correo del usuario con el que se autentican las pruebas. */
export const getTestEmail = () => required('E2E_EMAIL');

/** Contraseña de ese usuario. */
export const getTestPassword = () => required('E2E_PASSWORD');

/**
 * URL contra la que corren las pruebas de verificación.
 *
 * Por defecto apunta al entorno local. Para apuntar a otro entorno se define
 * E2E_BASE_URL — pero conviene que sea un negocio de pruebas, nunca uno con
 * datos de clientes reales.
 */
export const getBaseUrl = () => {
  loadEnvFile();
  return process.env.E2E_BASE_URL || 'http://localhost:3001';
};
