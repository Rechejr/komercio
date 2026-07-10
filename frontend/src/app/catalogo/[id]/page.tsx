'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { Search, MapPin, Phone, ShoppingBag, MessageCircle } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

interface Product {
  id: string; name: string; description?: string;
  salePrice: number; unit: string; inStock: boolean;
  image?: string; category?: { id: string; name: string };
}
interface Business {
  id: string; name: string; logo?: string;
  city?: string; phone?: string; address?: string; category?: string;
}

function formatCOP(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
}

// Emoji por categoría para productos sin imagen
const CAT_EMOJI: Record<string, string> = {
  bebidas: '🥤', lácteos: 'lacteos', lacteos: '🥛', snacks: '🍿',
  aseo: '🧴', limpieza: '🧹', abarrotes: '🛒', carnes: '🥩',
  frutas: '🍎', verduras: '🥦', panaderia: '🍞', panadería: '🍞',
  dulces: '🍬', confiteria: '🍭', tecnologia: '💻', electronica: '📱',
  ropa: '👕', ferreteria: '🔨', ferretería: '🔨',
  papeleria: '📚', papelería: '📚', drogueria: '💊', farmacia: '💊',
};
function catEmoji(name?: string) {
  if (!name) return '📦';
  const k = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return CAT_EMOJI[k] || '📦';
}

export default function CatalogoPage() {
  const { id } = useParams<{ id: string }>();
  const [business, setBusiness] = useState<Business | null>(null);
  const [products, setProducts]  = useState<Product[]>([]);
  const [loading, setLoading]    = useState(true);
  const [error, setError]        = useState('');
  const [search, setSearch]      = useState('');
  const [catFilter, setCatFilter] = useState('');

  useEffect(() => {
    fetch(`${API}/public/catalogo/${id}`)
      .then(r => r.json())
      .then(d => {
        if (!d.success) { setError('Catálogo no disponible'); return; }
        setBusiness(d.data.business);
        setProducts(d.data.products);
      })
      .catch(() => setError('No se pudo cargar el catálogo'))
      .finally(() => setLoading(false));
  }, [id]);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    products.forEach(p => { if (p.category) seen.set(p.category.id, p.category.name); });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const filtered = useMemo(() => products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || p.category?.id === catFilter;
    return matchSearch && matchCat;
  }), [products, search, catFilter]);

  const availableList   = filtered.filter(p => p.inStock);
  const unavailableList = filtered.filter(p => !p.inStock);
  const grouped  = [...availableList, ...unavailableList];

  function contactWhatsApp() {
    if (!business?.phone) return;
    const phone = business.phone.replace(/\D/g, '');
    const full  = `57${phone.replace(/^57/, '')}`;
    const text  = `Hola, vi su catálogo de *${business.name}* y quisiera hacer un pedido 🛒`;
    window.open(`https://wa.me/${full}?text=${encodeURIComponent(text)}`, '_blank');
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0DA06A] animate-pulse" />
        <p className="text-sm text-slate-500">Cargando catálogo…</p>
      </div>
    </div>
  );

  if (error || !business) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h1 className="text-xl font-bold text-slate-800 mb-2">Catálogo no encontrado</h1>
        <p className="text-slate-500 text-sm">{error || 'El link puede estar desactualizado.'}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          {business.logo
            ? <Image src={business.logo} alt={business.name} width={44} height={44} className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
            : <div className="w-11 h-11 rounded-xl bg-[#0DA06A] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold text-xl">{business.name[0]}</span>
              </div>
          }
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-900 text-[16px] leading-tight truncate">{business.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              {business.city && (
                <span className="flex items-center gap-1 text-[12px] text-slate-500">
                  <MapPin size={11} /> {business.city}
                </span>
              )}
              <span className="flex items-center gap-1 text-[12px] text-[#0DA06A] font-medium">
                <ShoppingBag size={11} /> {products.filter(p => p.inStock).length} productos
              </span>
            </div>
          </div>
          {business.phone && (
            <button
              onClick={contactWhatsApp}
              className="flex-shrink-0 flex items-center gap-1.5 bg-[#25D366] text-white text-[12px] font-semibold px-3 py-2 rounded-xl hover:bg-[#1ebe5d] transition-colors"
            >
              <MessageCircle size={13} /> Contactar
            </button>
          )}
        </div>

        {/* Search */}
        <div className="max-w-2xl mx-auto px-4 pb-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full pl-8 pr-4 py-2 text-[16px] sm:text-[13px] bg-slate-100 border-none rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0DA06A]/25 text-slate-800 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Category chips */}
        {categories.length > 1 && (
          <div className="max-w-2xl mx-auto px-4 pb-3 flex gap-2 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setCatFilter('')}
              className={`flex-shrink-0 px-3 py-1 rounded-lg text-[12px] font-semibold transition-colors ${
                !catFilter ? 'bg-[#0DA06A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos
            </button>
            {categories.map(c => (
              <button
                key={c.id}
                onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}
                className={`flex-shrink-0 px-3 py-1 rounded-lg text-[12px] font-semibold transition-colors ${
                  catFilter === c.id ? 'bg-[#0DA06A] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Product grid ── */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {grouped.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <div className="text-4xl mb-3">📦</div>
            <p className="text-sm">No se encontraron productos</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {grouped.map(p => {
              const available = p.inStock;
              return (
                <div
                  key={p.id}
                  className={`bg-white rounded-2xl overflow-hidden border transition-shadow ${
                    available ? 'border-slate-100 shadow-sm hover:shadow-md' : 'border-slate-100 opacity-60'
                  }`}
                >
                  {/* Image / emoji */}
                  <div className="aspect-square bg-slate-50 flex items-center justify-center overflow-hidden relative">
                    {p.image
                      ? <Image src={p.image} alt={p.name} fill className="object-cover" />
                      : <span className="text-4xl">{catEmoji(p.category?.name)}</span>
                    }
                    {!available && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                        <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">Agotado</span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-[13px] font-semibold text-slate-800 leading-tight line-clamp-2">{p.name}</p>
                    {p.category && (
                      <p className="text-[11px] text-slate-400 mt-0.5">{p.category.name}</p>
                    )}
                    <p className="text-[15px] font-bold text-[#0DA06A] mt-1.5">{formatCOP(p.salePrice)}</p>
                    {available && (
                      <span className="inline-block mt-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full">
                        Disponible
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-400 mt-8 mb-4">
          Catálogo generado con <span className="font-semibold text-[#0DA06A]">Ventrix</span> · ventrix.lat
        </p>
      </div>
    </div>
  );
}
