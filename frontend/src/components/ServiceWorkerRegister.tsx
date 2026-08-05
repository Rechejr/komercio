'use client';

import { useEffect } from 'react';

// Registra el service worker (/sw.js) para que Ventrix se pueda instalar como
// app. Es "best-effort": si falla o el navegador no lo soporta, la app funciona
// igual. No renderiza nada.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sin SW la app sigue funcionando */ });
  }, []);
  return null;
}
