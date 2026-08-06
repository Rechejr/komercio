// Service worker de Ventrix.
//
// NO cachea ni intercepta peticiones (passthrough total): así nunca sirve una
// versión vieja tras un despliegue ni interfiere con el API. Su función es (1)
// cumplir los requisitos para INSTALAR la PWA y (2) recibir Web Push para mostrar
// las alertas de vencimientos aunque la app esté cerrada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => { /* passthrough: sin respondWith → red normal */ });

// Llega un push del servidor (cron de vencimientos). Muestra la notificación del
// sistema. El payload es el JSON que envía el backend (config/webpush.ts).
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = {}; }
  const title = data.title || 'Ventrix';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/contable/panel' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Al tocar la notificación: enfoca una ventana ya abierta de la app o abre una
// nueva en la ruta indicada.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
