import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  // No capturar errores de red esperados (4xx)
  ignoreErrors: [
    'Network request failed',
    'Failed to fetch',
    'AbortError',
  ],
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
});