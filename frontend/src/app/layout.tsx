import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'Ventrix — El punto de venta gratis para tu negocio', template: '%s | Ventrix' },
  description: 'Ventrix es el punto de venta gratis para registrar ventas, controlar tu inventario y conocer a tus clientes. Sin tarjeta. Listo en 2 minutos.',
  keywords: ['pos', 'punto de venta', 'inventario', 'ventas', 'negocio', 'colombia', 'gratis'],
  icons: {
    icon: [
      { url: '/ventrix-logo.svg', type: 'image/svg+xml' },
    ],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
