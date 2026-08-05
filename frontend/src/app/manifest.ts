import type { MetadataRoute } from 'next';

// Manifiesto de la PWA: permite instalar Ventrix como app (ícono propio,
// pantalla completa). Next.js lo sirve en /manifest.webmanifest y lo enlaza solo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ventrix — Punto de venta y agenda contable',
    short_name: 'Ventrix',
    description: 'Registra ventas, controla tu inventario y lleva al día tu agenda tributaria.',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FFFFFF',
    theme_color: '#0DA06A',
    lang: 'es-CO',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
