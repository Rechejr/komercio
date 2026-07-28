'use client';

import { useState } from 'react';
import Image from 'next/image';
import { MessageCircle, MapPin, ArrowLeft, Store } from 'lucide-react';

interface Variant { id: string; talla?: string | null; color?: string | null; inStock: boolean; }
export interface ShareProduct {
  id: string; name: string; code?: string; description?: string;
  salePrice: number; unit: string; inStock: boolean;
  image?: string; images?: string[]; category?: { id: string; name: string } | null;
  hasVariants?: boolean; variants?: Variant[];
}
export interface ShareBusiness {
  id: string; name: string; logo?: string | null; city?: string | null; phone?: string | null;
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

// window.open() lo bloquean varios navegadores móviles (Samsung Internet, in-app).
// Un click de <a> real cuenta como navegación del usuario y no se bloquea.
function openWhatsApp(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function ProductShareView({ product, business }: { product: ShareProduct; business: ShareBusiness }) {
  const [talla, setTalla] = useState('');
  const [color, setColor] = useState('');
  const [img, setImg] = useState(0);

  const imgs = product.images && product.images.length ? product.images : (product.image ? [product.image] : []);
  const tallas = Array.from(new Set((product.variants || []).map((v) => v.talla).filter(Boolean))) as string[];
  const colores = Array.from(new Set((product.variants || []).map((v) => v.color).filter(Boolean))) as string[];
  const selV = product.hasVariants ? (product.variants || []).find((v) => (v.talla || '') === talla && (v.color || '') === color) : undefined;
  const missing = !!product.hasVariants && ((tallas.length > 0 && !talla) || (colores.length > 0 && !color));
  const agotado = !!product.hasVariants ? (!missing && (!selV || !selV.inStock)) : !product.inStock;
  const canOrder = !!business.phone && (!product.hasVariants ? product.inStock : (!missing && !!selV && selV.inStock));

  function order() {
    if (!business.phone) return;
    const phone = `57${business.phone.replace(/\D/g, '').replace(/^57/, '')}`;
    const v = [talla, color].filter(Boolean).join(' · ');
    const ref = product.code ? ` [Ref: ${product.code}]` : '';
    const link = typeof window !== 'undefined' ? window.location.href : '';
    const text =
      `Hola *${business.name}*, me interesa este producto:\n\n` +
      `• ${product.name}${ref}${v ? ` · ${v}` : ''} — ${formatCOP(product.salePrice)}` +
      (link ? `\n📷 ${link}` : '');
    openWhatsApp(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`);
  }

  const catalogHref = `/catalogo/${business.id}`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header del negocio */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <a href={catalogHref} className="text-slate-400 hover:text-slate-600 -ml-1 p-1"><ArrowLeft size={18} /></a>
          {business.logo
            ? <Image src={business.logo} alt={business.name} width={36} height={36} className="w-9 h-9 rounded-lg object-cover" />
            : <div className="w-9 h-9 rounded-lg bg-[#0DA06A] flex items-center justify-center text-white font-bold">{business.name[0]}</div>}
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-[14px] leading-tight truncate">{business.name}</p>
            {business.city && <span className="flex items-center gap-1 text-[11px] text-slate-500"><MapPin size={10} /> {business.city}</span>}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto pb-28">
        {/* Galería */}
        <div className="relative bg-white">
          <div
            onScroll={(e) => { const el = e.currentTarget; setImg(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))); }}
            className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
          >
            {imgs.length > 0 ? imgs.map((src, i) => (
              <div key={i} className="snap-center shrink-0 w-full aspect-square relative bg-slate-50">
                <Image src={src} alt={product.name} fill priority={i === 0} className="object-contain" />
              </div>
            )) : (
              <div className="shrink-0 w-full aspect-square flex items-center justify-center text-6xl bg-slate-50">📦</div>
            )}
          </div>
          {imgs.length > 1 && (
            <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
              {imgs.map((_, i) => <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === img ? 'bg-[#0DA06A]' : 'bg-white/80 ring-1 ring-slate-300'}`} />)}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="bg-white px-4 pt-4 pb-5 space-y-3">
          <div>
            <h1 className="text-[19px] font-bold text-slate-900 leading-tight">{product.name}</h1>
            {product.code && <p className="text-[11px] text-slate-400 mt-0.5">Ref: {product.code}</p>}
            <p className="text-[24px] font-bold text-[#0DA06A] mt-1">{formatCOP(product.salePrice)}</p>
          </div>
          {product.description && <p className="text-[14px] text-slate-600 leading-relaxed whitespace-pre-line">{product.description}</p>}

          {product.hasVariants && (
            <div className="space-y-3 pt-1">
              {colores.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold text-slate-700 mb-1.5">Color: <span className="text-slate-500 font-normal">{color || 'Elige'}</span></p>
                  <div className="flex flex-wrap gap-2">
                    {colores.map((c) => (
                      <button key={c} onClick={() => setColor(color === c ? '' : c)} className={`px-3 py-1.5 rounded-lg text-[13px] font-medium border transition ${color === c ? 'border-[#0DA06A] bg-emerald-50 text-[#0DA06A]' : 'border-slate-200 text-slate-600'}`}>{c}</button>
                    ))}
                  </div>
                </div>
              )}
              {tallas.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold text-slate-700 mb-1.5">Talla: <span className="text-slate-500 font-normal">{talla || 'Elige'}</span></p>
                  <div className="flex flex-wrap gap-2">
                    {tallas.map((t) => (
                      <button key={t} onClick={() => setTalla(talla === t ? '' : t)} className={`min-w-[44px] px-3 py-1.5 rounded-lg text-[13px] font-medium border transition ${talla === t ? 'border-[#0DA06A] bg-emerald-50 text-[#0DA06A]' : 'border-slate-200 text-slate-600'}`}>{t}</button>
                    ))}
                  </div>
                </div>
              )}
              {agotado && <p className="text-[12px] text-red-500 font-medium">Esa combinación está agotada.</p>}
            </div>
          )}
          {!product.hasVariants && !product.inStock && <p className="text-[13px] text-red-500 font-medium">Producto agotado.</p>}
        </div>

        {/* Ver todo el catálogo */}
        <a href={catalogHref} className="mt-3 mx-4 flex items-center justify-center gap-2 bg-white border border-slate-200 text-slate-600 text-[13px] font-semibold py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
          <Store size={15} /> Ver todo el catálogo
        </a>
      </div>

      {/* Barra fija: pedir por WhatsApp */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 z-20">
        <div className="max-w-md mx-auto p-3">
          <button
            disabled={!canOrder}
            onClick={order}
            className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-white font-bold py-3.5 rounded-xl hover:bg-[#1ebe5d] disabled:opacity-50 transition-colors"
          >
            <MessageCircle size={18} /> {missing ? 'Elige talla/color' : agotado ? 'Agotado' : 'Pedir por WhatsApp'}
          </button>
        </div>
      </div>
    </div>
  );
}
