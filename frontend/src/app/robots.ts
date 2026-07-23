import type { MetadataRoute } from 'next';
import { LEGAL_READY } from '@/lib/legal';

const BASE_URL = 'https://www.ventrix.lat';

// El home, login, registro y las páginas legales son las únicas páginas
// públicas pensadas para aparecer en buscadores. Todo lo demás (dashboard,
// superadmin) requiere sesión y no aporta valor de SEO — indexarlo solo
// diluiría la relevancia del dominio para las búsquedas que sí importan.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/register', ...(LEGAL_READY ? ['/terminos', '/privacidad'] : [])],
      disallow: [
        // Mientras los documentos legales sean un borrador, se bloquean.
        ...(LEGAL_READY ? [] : ['/terminos', '/privacidad']),
        '/dashboard',
        '/pos',
        '/inventario',
        '/compras',
        '/proveedores',
        '/ventas',
        '/clientes',
        '/creditos',
        '/gastos',
        '/caja',
        '/transferencias',
        '/reportes',
        '/configuracion',
        '/superadmin',
        '/payment-result',
        '/forgot-password',
        '/reset-password',
        '/verify-email',
      ],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
