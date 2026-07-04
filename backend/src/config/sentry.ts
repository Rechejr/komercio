import * as Sentry from '@sentry/node';
import { logger } from './logger';

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    logger.warn('SENTRY_DSN no configurado — monitoreo de errores desactivado');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 0,
    // No capturar errores esperados (4xx de negocio)
    beforeSend(event) {
      const status = (event.extra?.status as number) ?? 500;
      if (status < 500) return null;
      return event;
    },
  });

  logger.info('Sentry inicializado');
}

export { Sentry };