import nodemailer from 'nodemailer';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = `"Komercio" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

export const emailService = {
  async sendVerification(to: string, name: string, token: string) {
    const url = `${APP_URL}/verify-email?token=${token}`;
    await transporter.sendMail({
      from: FROM,
      to,
      subject: 'Verifica tu cuenta en Komercio',
      html: verificationTemplate(name, url),
    }).catch((err) => logger.error(`Email verification send error: ${err?.message || err}`, { code: err?.code, response: err?.response }));
  },

  async sendPasswordReset(to: string, name: string, token: string) {
    const url = `${APP_URL}/reset-password?token=${token}`;
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
