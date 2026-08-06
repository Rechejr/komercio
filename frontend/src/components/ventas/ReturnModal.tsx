'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Portal } from '@/components/ui/Portal';
import toast from 'react-hot-toast';
import { X, RotateCcw, Loader2, Undo2 } from 'lucide-react';

interface SaleDetail {
  id: string;
  quantity: number;
  unitPrice: string | number;
  total: string | number;
  product?: { name?: string };
}
interface SaleForReturn {
  id: string;
  invoiceNumber: string;
  details: SaleDetail[];
  returns?: Array<{ details: Array<{ saleDetailId?: string | null; quantity: number }> }>;
  credit?: { status: string; balance: string | number } | null;
}

const roundCOP = (n: number) => Math.round(n);

export function ReturnModal({ sale, onClose, onDone }: { sale: SaleForReturn; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);

  // Cuánto se devolvió ya de cada línea (devoluciones previas).
  const returnedByDetail = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of sale.returns || []) {
      for (const d of r.details) {
        if (d.saleDetailId) m[d.saleDetailId] = (m[d.saleDetailId] || 0) + d.quantity;
      }
    }
    return m;
  }, [sale.returns]);

  const lines = sale.details.map((d) => {
    const already = returnedByDetail[d.id] || 0;
    const maxReturnable = d.quantity - already;
    const perUnit = roundCOP(Number(d.total) / d.quantity);
    return { d, already, maxReturnable, perUnit };
  });

  const setQty = (id: string, val: number, max: number) => {
    const clamped = Math.max(0, Math.min(val, max));
    setQtys((q) => ({ ...q, [id]: clamped }));
  };

  const refundTotal = lines.reduce((s, l) => s + roundCOP(l.perUnit * (qtys[l.d.id] || 0)), 0);
  const anySelected = lines.some((l) => (qtys[l.d.id] || 0) > 0);

  // Cómo se reembolsará (mismo criterio que el backend): primero baja el fiado.
  const outstanding = sale.credit && sale.credit.status !== 'CANCELLED' ? Number(sale.credit.balance) : 0;
  const creditPortion = Math.min(refundTotal, outstanding);
  const cashPortion = refundTotal - creditPortion;

  const mut = useMutation({
    mutationFn: () => {
      const items = lines
        .filter((l) => (qtys[l.d.id] || 0) > 0)
        .map((l) => ({ saleDetailId: l.d.id, quantity: qtys[l.d.id] }));
      return api.post(`/sales/${sale.id}/return`, { items, reason: reason.trim() || undefined, restock });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['sale', sale.id] });
      toast.success('Devolución registrada');
      onDone();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'No se pudo registrar la devolución'),
  });

  const numCls = 'w-16 px-2 py-1.5 text-center bg-slate-50 border border-slate-200 rounded-lg text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white';

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={() => !mut.isPending && onClose()}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
        <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <RotateCcw size={17} className="text-emerald-600 dark:text-emerald-400" />
              <div>
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-white leading-tight">Devolver productos</h2>
                <p className="text-[12px] text-slate-400 font-mono">{sale.invoiceNumber}</p>
              </div>
            </div>
            <button onClick={() => !mut.isPending && onClose()} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
          </div>

          <div className="px-6 py-4 overflow-y-auto flex-1 space-y-3">
            <p className="text-[12px] text-slate-500 dark:text-slate-400">Indica cuánto devolver de cada producto.</p>

            {lines.map((l) => {
              const q = qtys[l.d.id] || 0;
              const disabled = l.maxReturnable <= 0;
              return (
                <div key={l.d.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${q > 0 ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-500/40 dark:bg-emerald-500/[0.06]' : 'border-slate-100 dark:border-white/[0.06]'} ${disabled ? 'opacity-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-900 dark:text-white truncate">{l.d.product?.name || 'Producto'}</p>
                    <p className="text-[11px] text-slate-400">
                      Vendidos: {l.d.quantity}{l.already > 0 ? ` · Ya devueltos: ${l.already}` : ''} · {formatCurrency(l.perUnit)} c/u
                    </p>
                  </div>
                  {disabled ? (
                    <span className="text-[11px] text-slate-400 font-medium px-2">Devuelto</span>
                  ) : (
                    <div className="flex items-center gap-2 flex-none">
                      <input
                        type="number"
                        min={0}
                        max={l.maxReturnable}
                        value={q || ''}
                        onChange={(e) => setQty(l.d.id, Number(e.target.value), l.maxReturnable)}
                        placeholder="0"
                        className={numCls}
                      />
                      <span className="text-[11px] text-slate-400 w-10">/ {l.maxReturnable}</span>
                      <button
                        type="button"
                        onClick={() => setQty(l.d.id, l.maxReturnable, l.maxReturnable)}
                        className="text-[11px] font-medium text-emerald-600 hover:text-emerald-700 px-1"
                      >
                        Todo
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Motivo + reponer stock */}
            <div className="pt-1 space-y-3">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Motivo (opcional): producto defectuoso, cambio de talla…"
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
              />
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="w-4 h-4 rounded accent-emerald-600" />
                <span className="text-[13px] text-slate-700 dark:text-slate-300">Reponer al inventario</span>
                <span className="text-[11px] text-slate-400">(desmarcar si el producto volvió dañado)</span>
              </label>
            </div>
          </div>

          {/* Footer con total y reembolso */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.06] flex-shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-slate-500 dark:text-slate-400">Total a reembolsar</span>
              <span className="text-[17px] font-bold text-slate-900 dark:text-white tabular-nums">{formatCurrency(refundTotal)}</span>
            </div>
            {anySelected && (
              <p className="text-[11px] text-slate-400 -mt-1">
                {creditPortion > 0 && cashPortion > 0
                  ? `Se descuenta ${formatCurrency(creditPortion)} de la deuda y se devuelve ${formatCurrency(cashPortion)} en efectivo.`
                  : creditPortion > 0
                    ? 'Se descontará de la deuda del cliente (venta a crédito).'
                    : 'Se devolverá en efectivo (salida de caja).'}
              </p>
            )}
            <div className="flex gap-2.5">
              <button onClick={() => !mut.isPending && onClose()} className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-60" disabled={mut.isPending}>
                Cancelar
              </button>
              <button
                onClick={() => mut.mutate()}
                disabled={!anySelected || mut.isPending}
                className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition"
              >
                {mut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />} Registrar devolución
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
