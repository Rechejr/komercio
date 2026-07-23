// ─── Datos legales de Ventrix ──────────────────────────────────────────────────
//
// Este archivo es la ÚNICA fuente de verdad para los datos que aparecen en las
// páginas de Términos y Condiciones y Política de Privacidad. Si cambia la razón
// social, el NIT o el correo de contacto, se cambia aquí y se actualiza en ambas
// páginas automáticamente.
//
// ⚠️  IMPORTANTE: los campos marcados como "COMPLETAR" deben llenarse con los
// datos reales antes de publicar. La Ley 1581 de 2012 exige que el Responsable
// del Tratamiento esté plenamente identificado (nombre, domicilio y correo) en
// la política de privacidad — con placeholders, la política no es válida.

export const LEGAL = {
  /** Nombre comercial de la marca. */
  brand: 'Ventrix',

  /** Dominio público del servicio (sin barra final). */
  domain: 'https://www.ventrix.lat',

  /**
   * Razón social o nombre completo de quien presta el servicio y responde por
   * los datos. Si operas como persona natural, va tu nombre completo tal cual
   * aparece en la cédula.
   */
  legalName: '[COMPLETAR: razón social o nombre completo]',

  /** NIT (con dígito de verificación) o número de cédula. */
  taxId: '[COMPLETAR: NIT o cédula]',

  /** Domicilio de notificaciones. Debe ser una dirección física real. */
  address: '[COMPLETAR: dirección]',
  city: '[COMPLETAR: ciudad]',
  country: 'Colombia',

  /** Correo para consultas y reclamos de habeas data. Debe estar operativo. */
  privacyEmail: '[COMPLETAR: correo de contacto]',

  /** Correo de soporte comercial. Puede ser el mismo que el de privacidad. */
  supportEmail: '[COMPLETAR: correo de soporte]',

  /** WhatsApp de soporte en formato internacional, ej. +57 300 000 0000. */
  supportPhone: '[COMPLETAR: teléfono de soporte]',

  /** Fecha de última actualización mostrada al pie de cada documento. */
  lastUpdated: '23 de julio de 2026',
} as const;

/**
 * Proveedores externos que procesan datos por cuenta de Ventrix. La Ley 1581
 * obliga a informar al Titular a quién se transmiten sus datos, así que esta
 * lista debe mantenerse sincronizada con la infraestructura real: si mañana se
 * cambia de proveedor de correo o de hosting, hay que actualizarla aquí.
 */
export const SUBPROCESSORS = [
  { name: 'Neon',            purpose: 'Base de datos PostgreSQL donde se almacena la información', location: 'Estados Unidos / Unión Europea' },
  { name: 'Railway',         purpose: 'Servidores donde se ejecuta la aplicación',                  location: 'Estados Unidos' },
  { name: 'Vercel',          purpose: 'Entrega de la interfaz web',                                 location: 'Global (CDN)' },
  { name: 'Wompi (Bancolombia)', purpose: 'Procesamiento de pagos de la suscripción',               location: 'Colombia' },
  { name: 'Cloudinary',      purpose: 'Almacenamiento de imágenes de productos',                    location: 'Estados Unidos' },
  { name: 'Resend',          purpose: 'Envío de correos transaccionales',                           location: 'Estados Unidos' },
  { name: 'Google (Gemini)', purpose: 'Generación del resumen inteligente de ventas',               location: 'Estados Unidos' },
  { name: 'Sentry',          purpose: 'Registro de errores técnicos para diagnóstico',              location: 'Estados Unidos' },
] as const;
