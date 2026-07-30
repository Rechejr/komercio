import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Cifrado simétrico (AES-256-GCM) para datos sensibles reversibles — p. ej. las
// contraseñas de portales de la bóveda de credenciales, que el contador necesita
// VER y copiar (por eso no se hashean, se cifran).
//
// La llave se DERIVA de un secreto que la app ya tiene (JWT_SECRET) + un salt fijo,
// para no obligar a configurar una variable nueva en producción. Protege los datos
// en reposo: si alguien accede/filtra la base, no puede leer las claves sin el
// secreto. (Nota: rotar JWT_SECRET dejaría ilegibles las claves ya guardadas — no
// se rota en operación normal.)

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.JWT_SECRET || 'dev-secret-change-me';
  cachedKey = scryptSync(secret, 'ventrix-credenciales-salt-v1', 32);
  return cachedKey;
}

const SEP = ':';

/** Cifra un texto → "iv:authTag:ciphertext" (cada parte en base64). */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(SEP);
}

/** Descifra "iv:authTag:ciphertext". Devuelve '' si el formato/llave no son válidos. */
export function decrypt(payload: string): string {
  try {
    const [ivB64, tagB64, dataB64] = (payload || '').split(SEP);
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
