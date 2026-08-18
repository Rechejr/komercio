import crypto from 'crypto';

// Contraseña temporal legible para enviar por WhatsApp o correo: sin caracteres
// que se confundan al dictarla o copiarla a mano (0/O, 1/l/I). La usan el portal
// de vendedoras y la compra sin cuenta, que crean la cuenta por el cliente.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generarPasswordTemporal(largo = 10): string {
  const bytes = crypto.randomBytes(largo);
  let out = '';
  for (let i = 0; i < largo; i += 1) out += CHARS[bytes[i] % CHARS.length];
  return out;
}
