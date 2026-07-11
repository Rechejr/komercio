import dns from 'dns';
import nodemailer from 'nodemailer';
import { logger } from './logger';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';

// nodemailer resuelve el host por su cuenta y, cuando hay tanto registros A
// como AAAA (como smtp.gmail.com), ELIGE UNA IP AL AZAR entre ambas familias
// combinadas — no prefiere IPv4 pese a intentarlo primero internamente (ver
// nodemailer/lib/shared/index.js: formatDNSValue hace
// `addresses[Math.floor(Math.random() * addresses.length)]`). El contenedor
// de Railway no tiene salida IPv6 funcional, así que ~mitad de los envíos
// fallaban con ENETUNREACH al azar. No hay ninguna opción de transporte que
// nodemailer lea para forzar IPv4 (se probó `family` — la ignora por
// completo), así que se resuelve la IP nosotros mismos antes de conectar y
// se fuerza el certificado TLS a validar contra el hostname real (si no, la
// verificación de certificado fallaría al conectar por IP directa).
let cachedIPv4: { host: string; ip: string } | null = null;

async function resolveSmtpIPv4(): Promise<string> {
  if (cachedIPv4?.host === SMTP_HOST) return cachedIPv4.ip;
  try {
    const [ip] = await dns.promises.resolve4(SMTP_HOST);
    cachedIPv4 = { host: SMTP_HOST, ip };
    return ip;
  } catch (err: any) {
    logger.warn(`No se pudo resolver ${SMTP_HOST} a IPv4, se usará el hostname tal cual: ${err?.message || err}`);
    return SMTP_HOST;
  }
}

async function getTransporter() {
  const host = await resolveSmtpIPv4();
  return nodemailer.createTransport({
    host,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    tls: { servername: SMTP_HOST },
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const FROM = `"Komercio" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

export const emailService = {
  async sendVerification(to: string, name: string, token: string) {
    const url = `${APP_URL}/verify-email?token=${token}`;
    const transporter = await getTransporter();
    await transporter.sendMail({
      from: FROM,
      to,
      subject: 'Verifica tu cuenta en Komercio',
      html: verificationTemplate(name, url),
    }).catch((err) => logger.error(`Email verification send error: ${err?.message || err}`, { code: err?.code, response: err?.response }));
  },

  async sendPasswordReset(to: string, name: string, token: string) {
    const url = `${APP_URL}/reset-password?token=${token}`;
    const transporter = await getTransporter();
    await transporter.sendMail({
      from: FROM,
      to,
      subject: 'Restablece tu contraseña en Komercio',
      html: resetTemplate(name, url),
    }).catch((err) => logger.error(`Email reset send error: ${err?.message || err}`, { code: err?.code, response: err?.response }));
  },
};

// El nombre viene del usuario (registro) y se inserta crudo en HTML — sin
// escapar, un nombre como "<img src=x onerror=...>" se ejecutaría en el
// cliente de correo de quien lo reciba (o en el propio nombre, vía self-XSS
// contra el usuario que lo registró).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function verificationTemplate(name: string, url: string) {
  const safeName = escapeHtml(name);
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#2563eb;padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">Komercio</h1>
        </td></tr>
        <tr><td style="padding:40px 32px;">
          <p style="font-size:16px;color:#374151;margin:0 0 8px;">Hola, <strong>${safeName}</strong></p>
          <p style="font-size:15px;color:#6b7280;margin:0 0 32px;">Gracias por registrarte. Haz clic en el botón para verificar tu correo y activar tu cuenta.</p>
          <div style="text-align:center;margin:0 0 32px;">
            <a href="${url}" style="background:#2563eb;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:bold;display:inline-block;">Verificar mi cuenta</a>
          </div>
          <p style="font-size:13px;color:#9ca3af;margin:0;">El enlace expira en 24 horas. Si no creaste esta cuenta, ignora este mensaje.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;text-align:center;">
          <p style="font-size:12px;color:#9ca3af;margin:0;">© ${new Date().getFullYear()} Komercio. Todos los derechos reservados.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function resetTemplate(name: string, url: string) {
  const safeName = escapeHtml(name);
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#2563eb;padding:32px;text-align:center;">
          <h1 style="color:#fff;margin:0;font-size:24px;">Komercio</h1>
        </td></tr>
        <tr><td style="padding:40px 32px;">
          <p style="font-size:16px;color:#374151;margin:0 0 8px;">Hola, <strong>${safeName}</strong></p>
          <p style="font-size:15px;color:#6b7280;margin:0 0 32px;">Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para continuar.</p>
          <div style="text-align:center;margin:0 0 32px;">
            <a href="${url}" style="background:#dc2626;color:#fff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:bold;display:inline-block;">Restablecer contraseña</a>
          </div>
          <p style="font-size:13px;color:#9ca3af;margin:0;">El enlace expira en 1 hora. Si no solicitaste esto, ignora este mensaje.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:20px 32px;text-align:center;">
          <p style="font-size:12px;color:#9ca3af;margin:0;">© ${new Date().getFullYear()} Komercio. Todos los derechos reservados.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
