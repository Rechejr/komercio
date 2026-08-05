import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Ventrix — El punto de venta gratis para tu negocio', template: '%s | Ventrix' },
  description: 'Ventrix es el punto de venta gratis para registrar ventas, controlar tu inventario y conocer a tus clientes. Sin tarjeta. Listo en 2 minutos.',
  keywords: ['pos', 'punto de venta', 'inventario', 'ventas', 'negocio', 'colombia', 'gratis'],
  applicationName: 'Ventrix',
  icons: {
    icon: [
      { url: '/ventrix-logo.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // Comportamiento tipo app al instalar en iOS (pantalla completa, nombre corto).
  appleWebApp: { capable: true, title: 'Ventrix', statusBarStyle: 'default' },
  verification: {
    google: 'rOPXfKr57z3QXaT-HrpBjAO1g6HY07lkZhwhrax5Bf4',
  },
};

export const viewport: Viewport = {
  themeColor: '#0DA06A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
