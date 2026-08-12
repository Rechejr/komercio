'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/auth.store';
import { useCartStore } from '@/store/cart.store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Portal } from '@/components/ui/Portal';
import { FileText, Plus, Search, Trash2, X, Loader2, ShoppingCart, Eye, CheckCircle, MessageCircle } from 'lucide-react';

const inputCls =
  'w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

interface QItem { productId?: string; productVariantId?: string; name: string; code?: string; quantity: number; unitPrice: number; discountPct?: number; taxRate?: number; variantLabel?: string }
interface QuoteRow { id: string; number: string; customerName: string | null; total: string; status: string; validUntil: string | null; createdAt: string; itemCount: number }
interface QuoteFull extends QuoteRow { items: QItem[]; notes: string | null; customerId: string | null; customerPhone: string | null; subtotal: string; taxAmount: string; discountAmount: string }

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;
function waCotizacion(q: QuoteFull, negocio?: string | null): string {
  const lineas = q.items.map((it) => `• ${it.quantity} × ${it.name} — ${money(lineTotal(it))}`).join('\n');
  const vig = q.validUntil ? `\nVálida hasta: ${fmtVigencia(q.validUntil)}` : '';
  const msg = `*Cotización ${q.number}*${negocio ? ` — ${negocio}` : ''}\n\n${lineas}\n\n*Total: ${money(Number(q.total))}*${vig}\n\n_Gracias por su interés._`;
  const digits = (q.customerPhone || '').replace(/\D/g, '');
  // Con teléfono → chat directo del cliente; sin teléfono → WhatsApp abre para elegir contacto.
  if (digits) {
    const num = digits.length === 12 && digits.startsWith('57') ? digits : `57${digits}`;
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
  }
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
}

// Fecha de vigencia (@db.Date) en UTC para no correrse un día en Colombia.
const fmtVigencia = (iso: string | null) => iso ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(iso)) : '—';
const lineTotal = (it: QItem) => it.unitPrice * it.quantity * (1 - (it.discountPct || 0) / 100) * (1 + (it.taxRate || 0) / 100);

export default function CotizacionesPage() {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [delTarget, setDelTarget] = useState<QuoteRow | null>(null);

  const { data: quotes = [], isLoading } = useQuery<QuoteRow[]>({
    queryKey: ['quotes'],
    queryFn: () => api.get('/quotes?limit=100').then((r) => r.data.data),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/quotes/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast.success('Cotización eliminada'); setDelTarget(null); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo eliminar'),
  });

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-[12px] text-slate-500 dark:text-slate-400">
          Crea una cotización, compártela con el cliente y conviértela en venta con un clic cuando la aprueben.
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
          <Plus size={16} /> Nueva cotización
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left">
              <tr className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 font-semibold">Número</th>
                <th className="px-4 py-3 font-semibold">Cliente</th>
                <th className="px-4 py-3 font-semibold text-right">Total</th>
                <th className="px-4 py-3 font-semibold">Vigencia</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {isLoading ? (
                [...Array(4)].map((_, i) => <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></td>)}</tr>)
              ) : quotes.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <FileText size={30} className="mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-sm">Aún no hay cotizaciones. Crea la primera con “Nueva cotización”.</p>
                </td></tr>
              ) : quotes.map((q) => (
                <tr key={q.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" onClick={() => setDetailId(q.id)}>
                  <td className="px-4 py-3 font-mono text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">{q.number}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{q.customerName || <span className="text-slate-400">Sin cliente</span>}<span className="text-xs text-slate-400 block">{q.itemCount} producto{q.itemCount === 1 ? '' : 's'}</span></td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-800 dark:text-white tabular-nums">{formatCurrency(Number(q.total))}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 dark:text-slate-400">{fmtVigencia(q.validUntil)}</td>
                  <td className="px-4 py-3">
                    {q.status === 'CONVERTED'
                      ? <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"><CheckCircle size={11} /> Convertida</span>
                      : <span className="text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Pendiente</span>}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => setDetailId(q.id)} title="Ver" className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/20"><Eye size={15} /></button>
                      <button onClick={() => setDelTarget(q)} title="Eliminar" className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNew && <NuevaCotizacionModal onClose={() => setShowNew(false)} />}
      {detailId && <DetalleModal id={detailId} onClose={() => setDetailId(null)} />}

      <ConfirmDialog
        open={!!delTarget}
        onOpenChange={(o) => !o && setDelTarget(null)}
        title="¿Eliminar cotización?"
        description={delTarget ? `${delTarget.number}${delTarget.customerName ? ` · ${delTarget.customerName}` : ''}` : ''}
        confirmLabel="Eliminar" variant="danger" loading={delMut.isPending}
        onConfirm={() => delTarget && delMut.mutate(delTarget.id)}
      />
    </div>
  );
}

// ─── Modal: crear cotización ───────────────────────────────────────────────────
function NuevaCotizacionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const branchId = useAuthStore((s) => s.user?.branchId);
  const [prodSearch, setProdSearch] = useState('');
  const [items, setItems] = useState<QItem[]>([]);
  const [cliente, setCliente] = useState<{ id: string; name: string } | null>(null);
  const [cliSearch, setCliSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [validUntil, setValidUntil] = useState('');

  const { data: productos = [] } = useQuery({
    queryKey: ['quote-products', prodSearch, branchId],
    queryFn: () => api.get(`/products?search=${encodeURIComponent(prodSearch)}&limit=15&isActive=true${branchId ? `&branchId=${branchId}` : ''}`).then((r) => r.data.data),
    enabled: prodSearch.trim().length > 0,
  });
  const { data: clientes = [] } = useQuery({
    queryKey: ['quote-customers', cliSearch],
    queryFn: () => api.get(`/customers?limit=8&search=${encodeURIComponent(cliSearch)}`).then((r) => r.data.data),
    enabled: !cliente && cliSearch.trim().length > 0,
  });

  const total = useMemo(() => items.reduce((s, it) => s + lineTotal(it), 0), [items]);

  const addProducto = (p: any) => {
    setItems((prev) => {
      const existing = prev.findIndex((i) => i.productId === p.id && !i.productVariantId);
      if (existing >= 0) { const cp = [...prev]; cp[existing] = { ...cp[existing], quantity: cp[existing].quantity + 1 }; return cp; }
      return [...prev, { productId: p.id, name: p.name, code: p.code, quantity: 1, unitPrice: Number(p.salePrice), discountPct: 0, taxRate: Number(p.taxRate) || 0 }];
    });
    setProdSearch('');
  };
  const setQty = (i: number, q: number) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, quantity: Math.max(1, q) } : it));
  const setPrice = (i: number, v: number) => setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, unitPrice: Math.max(0, v) } : it));
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const saveMut = useMutation({
    mutationFn: () => api.post('/quotes', {
      customerId: cliente?.id || null, customerName: cliente?.name || null,
      items, notes: notes || null, validUntil: validUntil || null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quotes'] }); toast.success('Cotización creada'); onClose(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo crear'),
  });

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Nueva cotización</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
          </div>

          <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
            {/* Cliente */}
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Cliente <span className="text-slate-400">(opcional)</span></label>
              {cliente ? (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/15 border border-emerald-200 dark:border-emerald-800">
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{cliente.name}</span>
                  <button onClick={() => setCliente(null)} className="text-xs text-emerald-600 hover:underline">Cambiar</button>
                </div>
              ) : (
                <>
                  <input value={cliSearch} onChange={(e) => setCliSearch(e.target.value)} placeholder="Buscar cliente..." className={inputCls} />
                  {cliSearch && (
                    <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-white/[0.06] max-h-36 overflow-y-auto">
                      {clientes.length === 0 ? <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p> :
                        clientes.map((c: any) => <button key={c.id} onClick={() => { setCliente({ id: c.id, name: c.name }); setCliSearch(''); }} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm text-slate-800 dark:text-white">{c.name}</button>)}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Buscar producto */}
            <div>
              <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Productos</label>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} placeholder="Buscar producto por nombre o código..." className={cn(inputCls, 'pl-9')} />
              </div>
              {prodSearch && (
                <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-white/[0.06] max-h-40 overflow-y-auto">
                  {productos.length === 0 ? <p className="px-3 py-2 text-sm text-slate-400">Sin resultados</p> :
                    productos.map((p: any) => (
                      <button key={p.id} onClick={() => addProducto(p)} className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm flex items-center justify-between">
                        <span className="text-slate-800 dark:text-white">{p.name}</span>
                        <span className="text-xs text-slate-400 tabular-nums">{formatCurrency(Number(p.salePrice))}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Ítems */}
            {items.length > 0 && (
              <div className="space-y-1.5">
                {items.map((it, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-100 dark:border-white/[0.06]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">{it.name}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <input type="number" min={1} value={it.quantity} onChange={(e) => setQty(i, parseInt(e.target.value) || 1)} className="w-14 px-2 py-1 text-[12px] rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white" />
                        <span className="text-slate-400 text-xs">×</span>
                        <input type="number" min={0} value={it.unitPrice} onChange={(e) => setPrice(i, parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1 text-[12px] rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white tabular-nums" />
                      </div>
                    </div>
                    <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">{formatCurrency(lineTotal(it))}</span>
                    <button onClick={() => removeItem(i)} className="p-1 text-slate-400 hover:text-red-600"><X size={15} /></button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 pt-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span>Total</span><span className="tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Válida hasta</label>
                <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">Notas</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" className={inputCls} />
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex gap-2 flex-shrink-0">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-600 dark:text-slate-300">Cancelar</button>
            <button onClick={() => { if (!items.length) return toast.error('Agrega al menos un producto'); saveMut.mutate(); }} disabled={saveMut.isPending} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {saveMut.isPending ? <Loader2 size={15} className="animate-spin" /> : null} Crear cotización
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

// ─── Modal: detalle + convertir a venta ────────────────────────────────────────
function DetalleModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const router = useRouter();
  const businessName = useAuthStore((s) => s.user?.businessName);
  const clear = useCartStore((s) => s.clear);
  const addItem = useCartStore((s) => s.addItem);
  const setCustomer = useCartStore((s) => s.setCustomer);

  const { data: q, isLoading } = useQuery<QuoteFull>({
    queryKey: ['quote', id],
    queryFn: () => api.get(`/quotes/${id}`).then((r) => r.data.data),
  });

  const convertir = () => {
    if (!q) return;
    clear();
    for (const it of q.items) {
      addItem({ productId: it.productId || '', productVariantId: it.productVariantId, name: it.name, code: it.code || '', salePrice: Number(it.unitPrice), wholesalePrice: null, quantity: Number(it.quantity), discountPct: Number(it.discountPct || 0), taxRate: Number(it.taxRate || 0) });
    }
    if (q.customerId) setCustomer(q.customerId);
    api.patch(`/quotes/${q.id}/converted`).then(() => qc.invalidateQueries({ queryKey: ['quotes'] })).catch(() => {});
    toast.success('Cotización cargada en el POS — completa la venta');
    router.push('/pos');
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06]">
            <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">{q?.number ?? 'Cotización'}</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
          </div>
          {isLoading || !q ? (
            <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
          ) : (
            <>
              <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
                <div className="flex justify-between text-[13px]">
                  <span className="text-slate-500 dark:text-slate-400">Cliente</span>
                  <span className="text-slate-800 dark:text-white font-medium">{q.customerName || 'Sin cliente'}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-slate-500 dark:text-slate-400">Válida hasta</span>
                  <span className="text-slate-800 dark:text-white">{fmtVigencia(q.validUntil)}</span>
                </div>
                <div className="border-t border-slate-100 dark:border-white/[0.06] pt-3 space-y-1.5">
                  {q.items.map((it, i) => (
                    <div key={i} className="flex items-center justify-between text-[13px]">
                      <span className="text-slate-700 dark:text-slate-200 truncate mr-2">{it.quantity} × {it.name}</span>
                      <span className="text-slate-800 dark:text-white tabular-nums flex-none">{formatCurrency(lineTotal(it))}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 dark:border-white/[0.06] pt-3 text-[15px] font-bold text-slate-900 dark:text-white">
                  <span>Total</span><span className="tabular-nums">{formatCurrency(Number(q.total))}</span>
                </div>
                {q.notes && <p className="text-[12px] text-slate-500 dark:text-slate-400 pt-1">{q.notes}</p>}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] space-y-2">
                <div className="flex gap-2">
                  <a
                    href={waCotizacion(q, businessName)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-sm font-semibold flex items-center justify-center gap-2 transition"
                  >
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                  <button onClick={convertir} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center justify-center gap-2">
                    <ShoppingCart size={16} /> Convertir a venta
                  </button>
                </div>
                {q.status === 'CONVERTED' && <p className="text-[11px] text-center text-emerald-600 dark:text-emerald-400">Ya fue convertida antes — puedes volver a cargarla.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}
