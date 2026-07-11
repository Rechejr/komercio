import { Resend } from 'resend';
import { logger } from './logger';

// SMTP directo (nodemailer) se abandonó — Railway no logra completar la
// conexión TCP contra Gmail en ningún puerto (587 y 465 dan ETIMEDOUT), muy
// probablemente por una política de red que bloquea SMTP saliente (común en
// varios proveedores de hosting para evitar spam). Resend envía por HTTPS,
// que ningún proveedor bloquea.
// El constructor de Resend lanza si el API key es undefined — un valor
// dummy evita tumbar el arranque completo (y cualquier test que cargue
// app.ts transitivamente) cuando la variable no está configurada; el envío
// real simplemente fallará más adelante con un error claro en los logs,
// mismo criterio de "degradar sin romper" que ya usa Redis en este proyecto.
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_not_configured');

// Antes de verificar un dominio propio en Resend, la cuenta solo puede
// enviar desde este remitente de prueba y únicamente al correo dueño de la
// cuenta — suficiente para probar, no para clientes reales. Configurar
// EMAIL_FROM (ej. "Komercio <noreply@ventrix.lat>") una vez el dominio esté
// verificado en Resend.
const FROM = process.env.EMAIL_FROM || 'Komercio <onboarding@resend.dev>';
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

async function send(to: string, subject: string, html: string, label: string) {
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) logger.error(`${label}: ${error.message}`, { name: error.name });
  } catch (err: any) {
    logger.error(`${label} (excepción): ${err?.message || err}`);
  }
}

export const emailService = {
  async sendVerification(to: string, name: string, token: string) {
    const url = `${APP_URL}/verify-email?token=${token}`;
    await send(to, 'Verifica tu cuenta en Komercio', verificationTemplate(name, url), 'Email verification send error');
  },

  async sendPasswordReset(to: string, name: string, token: string) {
    const url = `${APP_URL}/reset-password?token=${token}`;
    await send(to, 'Restablece tu contraseña en Komercio', resetTemplate(name, url), 'Email reset send error');
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
