'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: '1rem', fontFamily: 'sans-serif' }}>
          <h2>Algo salió mal</h2>
          <button onClick={reset} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
            Intentar de nuevo
          </button>
        </div>
      </body>
    </html>
  );
}