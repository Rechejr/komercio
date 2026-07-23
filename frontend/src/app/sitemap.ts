import type { MetadataRoute } from 'next';

const BASE_URL = 'https://www.ventrix.lat';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: BASE_URL,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/register`,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/login`,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    // Las páginas legales se indexan a propósito: Google las considera una señal
    // de confianza (E-E-A-T) para un servicio que cobra suscripciones.
    {
      url: `${BASE_URL}/terminos`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${BASE_URL}/privacidad`,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
