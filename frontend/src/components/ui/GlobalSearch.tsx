'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Search, Users, Package, ShoppingCart, Truck, CreditCard, X, Loader2, ArrowRight } from 'lucide-react';

interface SearchResult {
  customers: { id: string; name: string; document?: string; phone?: string; currentDebt: number }[];
  products:  { id: string; name: string; code?: string; stock: number; salePrice: number }[];
  sales:     { id: string; invoiceNumber: string; total: number; status: string; createdAt: string; customer?: { name: string } }[];
  suppliers: { id: string; name: string; contactName?: string; phone?: string }[];
  credits:   { id: string; balance: number; status: string; customer: { id: string; name: string } }[];
}

interface FlatResult { label: string; sub: string; href: string; category: string }

function flatten(data: SearchResult): FlatResult[] {
  const out: FlatResult[] = [];
  for (const c of data.customers) {
    out.push({ category: 'Clientes', label: c.name, sub: [c.document, c.phone].filter(Boolean).join(' · ') || (c.currentDebt > 0 ? `Debe ${formatCurrency(c.currentDebt)}` : ''), href: `/clientes?search=${encodeURIComponent(c.name)}` });
  }
  for (const p of data.products) {
    out.push({ category: 'Productos', label: p.name, sub: `${p.code ? p.code + ' · ' : ''}${formatCurrency(p.salePrice)} · Stock: ${p.stock}`, href: `/inventario?search=${encodeURIComponent(p.name)}` });
  }
  for (const s of data.sales) {
    out.push({ category: 'Ventas', label: s.invoiceNumber, sub: `${s.customer?.name || 'Mostrador'} · ${formatCurrency(s.total)}`, href: `/ventas?search=${encodeURIComponent(s.invoiceNumber)}` });
  }
  for (const sp of data.suppliers) {
    out.push({ category: 'Proveedores', label: sp.name, sub: [sp.contactName, sp.phone].filter(Boolean).join(' · ') || '', href: `/proveedores?search=${encodeURIComponent(sp.name)}` });
  }
  for (const cr of data.credits) {
    out.push({ category: 'Créditos', label: cr.customer.name, sub: `Saldo: ${formatCurrency(cr.balance)}`, href: `/creditos?search=${encodeURIComponent(cr.customer.name)}` });
  }
  return out;
}

const CATEGORY_ICON: Record<string, React.ElementType> = {
  Clientes:    Users,
  Productos:   Package,
  Ventas:      ShoppingCart,
  Proveedores: Truck,
  'Créditos':  CreditCard,
};

const CATEGORY_COLOR: Record<string, string> = {
  Clientes:    'text-violet-500 bg-violet-50 dark:bg-violet-500/10',
  Productos:   'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10',
  Ventas:      'text-blue-500 bg-blue-50 dark:bg-blue-500/10',
  Proveedores: 'text-amber-600 bg-amber-50 dark:bg-amber-500/10',
  'Créditos':  'text-red-500 bg-red-50 dark:bg-red-500/10',
};

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const router     = useRouter();
  const inputRef   = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);
  const [q, setQ]  = useState('');
  const [idx, setIdx] = useState(0);

  const { data, isFetching } = useQuery<SearchResult>({
    queryKey: ['global-search', q],
    queryFn:  () => api.get(`/search?q=${encodeURIComponent(q)}`).then((r) => r.data.data),
    enabled:  open && q.trim().length >= 2,
    staleTime: 10_000,
  });

  const results: FlatResult[] = data ? flatten(data) : [];

  // Reset on open
  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (results.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter')     { e.preventDefault(); navigate(results[idx].href); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, idx]);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  // Reset index when results change
  useEffect(() => { setIdx(0); }, [results.length]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  if (!open) return null;

  // Group by category for display
  const grouped = results.reduce<Record<string, (FlatResult & { flatIdx: number })[]>>((acc, r, i) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push({ ...r, flatIdx: i });
    return acc;
  }, {});

  const hasResults = results.length > 0;
  const showEmpty  = q.trim().length >= 2 && !isFetching && !hasResults;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Búsqueda global"
        className="fixed inset-x-0 top-[10vh] z-50 mx-auto w-full max-w-lg px-4"
      >
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] rounded-2xl shadow-2xl shadow-black/20 overflow-hidden animate-scale-in">

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-white/[0.06]">
            {isFetching
              ? <Loader2 size={16} className="text-emerald-500 animate-spin flex-shrink-0" />
              : <Search size={16} className="text-slate-400 flex-shrink-0" />
            }
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar clientes, productos, ventas, proveedores..."
              className="flex-1 bg-transparent text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="w-5 h-5 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X size={13} />
              </button>
            )}
            <kbd className="hidden sm:flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[400px] overflow-y-auto overscroll-contain">
            {q.trim().length < 2 && (
              <div className="px-4 py-8 text-center">
                <Search size={28} className="mx-auto mb-2 text-slate-200 dark:text-slate-700" />
                <p className="text-[13px] text-slate-400 dark:text-slate-500">Escribe al menos 2 caracteres</p>
                <p className="text-[11px] text-slate-300 dark:text-slate-600 mt-1">Clientes · Productos · Ventas · Proveedores · Créditos</p>
              </div>
            )}

            {showEmpty && (
              <div className="px-4 py-8 text-center">
                <p className="text-[13px] text-slate-400 dark:text-slate-500">Sin resultados para "<span className="font-medium">{q}</span>"</p>
              </div>
            )}

            {hasResults && (
              <div className="py-1">
                {Object.entries(grouped).map(([cat, items]) => {
                  const Icon = CATEGORY_ICON[cat] ?? Search;
                  const colorCls = CATEGORY_COLOR[cat] ?? 'text-slate-500 bg-slate-100';
                  return (
                    <div key={cat}>
                      {/* Category header */}
                      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                        <div className={`w-5 h-5 rounded flex items-center justify-center ${colorCls}`}>
                          <Icon size={11} strokeWidth={2.5} />
                        </div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{cat}</span>
                      </div>
                      {/* Items */}
                      {items.map(({ label, sub, href, flatIdx }) => (
                        <button
                          key={href}
                          type="button"
                          data-idx={flatIdx}
                          onClick={() => navigate(href)}
                          onMouseEnter={() => setIdx(flatIdx)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                            idx === flatIdx
                              ? 'bg-emerald-50 dark:bg-emerald-500/10'
                              : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className={`text-[13px] font-medium truncate ${idx === flatIdx ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}>
                              {label}
                            </p>
                            {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{sub}</p>}
                          </div>
                          <ArrowRight size={13} className={`flex-shrink-0 transition-opacity ${idx === flatIdx ? 'opacity-100 text-emerald-500' : 'opacity-0'}`} />
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer hint */}
          {hasResults && (
            <div className="px-4 py-2 border-t border-slate-100 dark:border-white/[0.06] flex items-center gap-3">
              <span className="text-[10px] text-slate-300 dark:text-slate-600">
                <kbd className="font-mono">↑↓</kbd> navegar &nbsp;·&nbsp; <kbd className="font-mono">↵</kbd> abrir &nbsp;·&nbsp; <kbd className="font-mono">ESC</kbd> cerrar
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
