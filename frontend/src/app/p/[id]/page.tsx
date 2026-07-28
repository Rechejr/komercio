import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ProductShareView, { ShareProduct, ShareBusiness } from './ProductShareView';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// La ficha se renderiza en el servidor para que el crawler de WhatsApp lea las
// etiquetas OpenGraph y arme la tarjeta de vista previa (foto + nombre + precio).
async function fetchProduct(id: string): Promise<{ product: ShareProduct; business: ShareBusiness } | null> {
  try {
    const r = await fetch(`${API}/public/producto/${id}`, { next: { revalidate: 120 } });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.success) return null;
    return d.data as { product: ShareProduct; business: ShareBusiness };
  } catch {
    return null;
  }
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await fetchProduct(id);
  if (!data) return { title: 'Producto no encontrado · Ventrix' };

  const { product, business } = data;
  const cover = product.images?.[0] || product.image;
  const title = `${product.name}${business.name ? ` — ${business.name}` : ''}`;
  const description = product.description?.trim() || `${formatCOP(product.salePrice)} · Pídelo por WhatsApp`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: business.name,
      images: cover ? [{ url: cover }] : [],
    },
    twitter: {
      card: cover ? 'summary_large_image' : 'summary',
      title,
      description,
      images: cover ? [cover] : [],
    },
  };
}

export default async function ProductSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await fetchProduct(id);
  if (!data) notFound();
  return <ProductShareView product={data.product} business={data.business} />;
}
