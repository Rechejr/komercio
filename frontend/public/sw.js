// Service worker mínimo de Ventrix.
//
// Su ÚNICO fin es que la app cumpla los requisitos para poder INSTALARSE (PWA).
// A propósito NO intercepta ni cachea nada (passthrough total): así nunca sirve
// una versión vieja tras un despliegue ni interfiere con las llamadas al API.
// El modo offline real, si algún día se hace, es un trabajo aparte y con cuidado.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough: sin respondWith → red normal */ });
