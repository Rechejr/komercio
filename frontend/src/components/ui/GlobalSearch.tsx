'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  Search, Users, Package, ShoppingCart, Truck, CreditCard,
  X, Loader2, ArrowRight, AlertTriangle, Clock, ChevronRight,
} from 'lucide-react';

interface CreditResult {
  id: string;
  balance: number;
  status: string;
  dueDate?: string | null;
  customer: { id: string; name: string; phone?: string };
}

interface SearchResult {
  customers: { id: string; name: string; document?: string; phone?: string; currentDebt: number }[];
  products:  { id: string; name: string; code?: string; stock: number; salePrice: number }[];
  sales:     { id: string; invoiceNumber: string; total: number; status: string; createdAt: string; customer?: { name: string } }[];
  suppliers: { id: string; name: string; contactName?: string; phone?: string }[];
  credits:   CreditResult[];
  isFiadoQuery?: boolean;
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

const CREDIT_STATUS_LABEL: Record<string, string> = {
  PENDING:  'Pendiente',
  PARTIAL:  'Abono parcial',
  OVERDUE:  'Vencido',
};

const CREDIT_STATUS_CLS: Record<string, string> = {
  PENDING: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200/80 dark:border-amber-500/20',
  PARTIAL: 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200/80 dark:border-blue-500/20',
  OVERDUE: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-200/80 dark:border-red-500/20',
};

const CATEGORY_META: Record<string, { Icon: React.ElementType; iconCls: string }> = {
  Clientes:    { Icon: Users,        iconCls: 'text-violet-500 bg-violet-50 dark:bg-violet-500/15' },
  Productos:   { Icon: Package,      iconCls: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/15' },
  Ventas:      { Icon: ShoppingCart, iconCls: 'text-blue-500 bg-blue-50 dark:bg-blue-500/15' },
  Proveedores: { Icon: Truck,        iconCls: 'text-amber-600 bg-amber-50 dark:bg-amber-500/15' },
  'Créditos':  { Icon: CreditCard,   iconCls: 'text-red-500 bg-red-50 dark:bg-red-500/15' },
};

const IDLE_PILLS = [
  { label: 'Clientes',    Icon: Users,        cls: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-500/10 border-violet-200/80 dark:border-violet-500/20' },
  { label: 'Productos',   Icon: Package,      cls: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/80 dark:border-emerald-500/20' },
  { label: 'Ventas',      Icon: ShoppingCart, cls: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200/80 dark:border-blue-500/20' },
  { label: 'Proveedores', Icon: Truck,        cls: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200/80 dark:border-amber-500/20' },
  { label: 'Créditos',    Icon: CreditCard,   cls: 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200/80 dark:border-red-500/20' },
];

interface GlobalSearchProps {
  open: boolean;
  onClose: () => void;
}

export function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const router        = useRouter();
  const inputRef      = useRef<HTMLInputElement>(null);
  const listRef       = useRef<HTMLDivElement>(null);
  const [q, setQ]     = useState('');
  const [idx, setIdx] = useState(0);

  const { data, isFetching } = useQuery<SearchResult>({
    queryKey: ['global-search', q],
    queryFn:  () => api.get(`/search?q=${encodeURIComponent(q)}`).then((r) => r.data.data),
    enabled:  open && q.trim().length >= 2,
    staleTime: 10_000,
  });

  const isFiadoMode = data?.isFiadoQuery === true;
  const results: FlatResult[] = (data && !isFiadoMode) ? flatten(data) : [];

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (isFiadoMode || results.length === 0) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === 'Enter')     { e.preventDefault(); navigate(results[idx].href); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, results, idx, isFiadoMode]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${idx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  useEffect(() => { setIdx(0); }, [results.length]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  if (!open) return null;

  const grouped = results.reduce<Record<string, (FlatResult & { flatIdx: number })[]>>((acc, r, i) => {
    if (!acc[r.category]) acc[r.category] = [];
    acc[r.category].push({ ...r, flatIdx: i });
    return acc;
  }, {});

  const hasResults = results.length > 0;
  const showEmpty  = q.trim().length >= 2 && !isFetching && !hasResults && !isFiadoMode;
  const isIdle     = q.trim().length < 2;

  // Fiado mode data
  const fiadoCredits = isFiadoMode ? (data?.credits ?? []) : [];
  const fiadoTotal   = fiadoCredits.reduce((s, c) => s + Number(c.balance), 0);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 backdrop-blur-[2px] search-backdrop"
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden animate-scale-in search-modal">

          {/* Barra degradada — ámbar cuando es modo fiado, esmeralda normal */}
          <div
            aria-hidden="true"
            className={isFiadoMode ? 'search-accent-bar-fiado' : 'search-accent-bar'}
          />

          {/* Input */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100 dark:border-white/[0.06]">
            {isFetching ? (
              <Loader2 size={16} className="text-emerald-500 animate-spin flex-shrink-0" />
            ) : isFiadoMode ? (
              <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
            ) : (
              <Search
                size={16}
                strokeWidth={2.2}
                className={`flex-shrink-0 transition-colors duration-150 ${q ? 'text-emerald-500' : 'text-slate-400'}`}
              />
            )}
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar clientes, productos, ventas... o escribe «fiado»"
              className="flex-1 bg-transparent text-[14px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {q && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setQ('')}
                className="w-5 h-5 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                <X size={13} />
              </button>
            )}
            <kbd className="hidden sm:flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono search-esc-kbd">
              ESC
            </kbd>
          </div>

          {/* Cuerpo */}
          <div ref={listRef} className="max-h-[420px] overflow-y-auto overscroll-contain">

            {/* Estado idle */}
            {isIdle && (
              <div className="px-5 py-6">
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center search-idle-icon">
                      <Search size={20} className="text-emerald-500" strokeWidth={2} />
                    </div>
                    <div aria-hidden="true" className="absolute -inset-1.5 rounded-xl pointer-events-none border border-dashed border-emerald-400/25" />
                  </div>
                </div>
                <p className="text-center text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Busca en todos los módulos
                </p>
                <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mb-4">
                  Escribe al menos 2 caracteres
                </p>
                <div className="flex flex-wrap justify-center gap-2 mb-3">
                  {IDLE_PILLS.map(({ label, Icon, cls }) => (
                    <span key={label} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${cls}`}>
                      <Icon size={11} strokeWidth={2.5} />
                      {label}
                    </span>
                  ))}
                </div>

                {/* Hint fiado */}
                <button
                  type="button"
                  onClick={() => setQ('fiado')}
                  className="mx-auto flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-amber-300 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/10 transition-colors"
                >
                  <AlertTriangle size={13} className="flex-shrink-0" />
                  <span className="text-[12px] font-medium">
                    Escribe <strong className="font-bold">"fiado"</strong> para ver todos los créditos pendientes
                  </span>
                  <ChevronRight size={12} className="flex-shrink-0 opacity-60" />
                </button>
              </div>
            )}

            {/* Sin resultados */}
            {showEmpty && (
              <div className="px-4 py-8 text-center">
                <div className="w-10 h-10 rounded-xl mx-auto mb-3 flex items-center justify-center search-idle-icon">
                  <Search size={18} className="text-emerald-400" strokeWidth={1.8} />
                </div>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">
                  Sin resultados para{' '}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">"{q}"</span>
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Intenta con el nombre, código o número de documento
                </p>
              </div>
            )}

            {/* ── Vista especial FIADO ──────────────────────────────────────── */}
            {isFiadoMode && (
              <div>
                {/* Resumen totales */}
                <div className="px-4 py-3 border-b border-amber-100 dark:border-amber-500/10 bg-amber-50/50 dark:bg-amber-500/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
                        <AlertTriangle size={12} className="text-amber-600 dark:text-amber-400" strokeWidth={2.5} />
                      </div>
                      <span className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
                        {fiadoCredits.length} {fiadoCredits.length === 1 ? 'cliente' : 'clientes'} con fiado
                      </span>
                    </div>
                    <span className="text-[13px] font-bold text-amber-700 dark:text-amber-400 tabular-nums">
                      {formatCurrency(fiadoTotal)}
                    </span>
                  </div>
                </div>

                {fiadoCredits.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <p className="text-[13px] text-slate-400 dark:text-slate-500">No hay créditos pendientes</p>
                  </div>
                ) : (
                  <div className="py-1">
                    {fiadoCredits.map((cr) => {
                      const isOverdue = cr.status === 'OVERDUE';
                      return (
                        <button
                          key={cr.id}
                          type="button"
                          onClick={() => navigate(`/creditos?search=${encodeURIComponent(cr.customer.name)}`)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-50/60 dark:hover:bg-amber-500/5 transition-colors border-l-2 border-transparent hover:border-amber-400"
                        >
                          {/* Avatar inicial */}
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-500/20 dark:to-amber-600/10 flex items-center justify-center flex-shrink-0">
                            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400">
                              {cr.customer.name.charAt(0).toUpperCase()}
                            </span>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">
                                {cr.customer.name}
                              </p>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold border flex-shrink-0 ${CREDIT_STATUS_CLS[cr.status] ?? CREDIT_STATUS_CLS.PENDING}`}>
                                {isOverdue && <Clock size={9} />}
                                {CREDIT_STATUS_LABEL[cr.status] ?? cr.status}
                              </span>
                            </div>
                            {cr.customer.phone && (
                              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                                {cr.customer.phone}
                              </p>
                            )}
                          </div>

                          <span className="text-[13px] font-bold text-amber-700 dark:text-amber-400 tabular-nums flex-shrink-0">
                            {formatCurrency(cr.balance)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Footer — ir al módulo completo */}
                <div className="px-4 py-2.5 border-t border-amber-100 dark:border-amber-500/10 bg-amber-50/30 dark:bg-amber-500/5">
                  <button
                    type="button"
                    onClick={() => navigate('/creditos')}
                    className="w-full flex items-center justify-center gap-1.5 text-[12px] font-medium text-amber-700 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 transition-colors"
                  >
                    Ver todos en módulo de créditos
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* Resultados normales agrupados */}
            {hasResults && (
              <div className="py-1.5">
                {Object.entries(grouped).map(([cat, items]) => {
                  const meta = CATEGORY_META[cat] ?? { Icon: Search, iconCls: 'text-slate-500 bg-slate-100' };
                  return (
                    <div key={cat}>
                      <div className="px-4 pt-3 pb-1.5 flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${meta.iconCls}`}>
                          <meta.Icon size={12} strokeWidth={2.5} />
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                          {cat}
                        </span>
                        <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.05]" />
                        <span className="text-[10px] text-slate-300 dark:text-slate-600 tabular-nums">
                          {items.length}
                        </span>
                      </div>
                      {items.map(({ label, sub, href, flatIdx }) => {
                        const active = idx === flatIdx;
                        return (
                          <button
                            key={href}
                            type="button"
                            data-idx={flatIdx}
                            onClick={() => navigate(href)}
                            onMouseEnter={() => setIdx(flatIdx)}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all duration-100 ${
                              active ? 'search-item-active' : 'search-item-inactive hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className={`text-[13px] font-medium truncate transition-colors ${
                                active ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'
                              }`}>
                                {label}
                              </p>
                              {sub && <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{sub}</p>}
                            </div>
                            <ArrowRight
                              size={13}
                              className={`flex-shrink-0 text-emerald-500 transition-all duration-150 ${
                                active ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer con atajos — solo en modo normal */}
          {hasResults && (
            <div className="px-4 py-2 flex items-center gap-3 search-footer">
              {([['↑↓', 'navegar'], ['↵', 'abrir'], ['ESC', 'cerrar']] as const).map(([key, label]) => (
                <span key={key} className="flex items-center gap-1 text-[10px] text-slate-400 dark:text-slate-500">
                  <kbd className="px-1.5 py-0.5 rounded font-mono text-[10px] search-kbd">{key}</kbd>
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
