'use client';

import { useEffect } from 'react';
import { useFieldArray, type Control, type UseFormRegister, type UseFormWatch, type UseFormSetValue } from 'react-hook-form';
import { formatCurrency } from '@/lib/utils';
import { Plus, X, HandCoins } from 'lucide-react';

const roundCOP = (n: number) => Math.round(n);
const inputCls = 'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white transition';

interface Props {
  control: Control<any>;
  register: UseFormRegister<any>;
  watch: UseFormWatch<any>;
  setValue: UseFormSetValue<any>;
  paymentAccounts: Array<{ id: string; name: string }>;
  total: number;
}

// Pago de una compra: uno o varios medios a la vez + opción de quedar debiendo
// al proveedor (crédito). Con un solo medio y sin crédito se comporta como antes
// (paga el total); solo al agregar medios o activar crédito se editan los montos.
export function PurchasePaymentSplit({ control, register, watch, setValue, paymentAccounts, total }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'payments' });
  const payments: Array<{ paymentAccountId?: string; amount?: string }> = watch('payments') || [];
  const credit: boolean = watch('credit');

  const paidSum = roundCOP(payments.reduce((s, p) => s + (parseFloat(String(p?.amount)) || 0), 0));
  const creditAmount = Math.max(0, roundCOP(total - paidSum));
  const singleSimple = fields.length === 1 && !credit;

  // Caso común (un medio, sin crédito): el monto sigue al total automáticamente.
  useEffect(() => {
    if (singleSimple) setValue('payments.0.amount', total ? String(roundCOP(total)) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, singleSimple]);

  // Primer medio por defecto = primera cuenta activa.
  useEffect(() => {
    if (paymentAccounts?.length && !payments?.[0]?.paymentAccountId) {
      setValue('payments.0.paymentAccountId', paymentAccounts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentAccounts]);

  const descuadre = !credit && total > 0 && Math.abs(paidSum - total) > 1;

  return (
    <div>
      <label className="text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1.5 block">Pago</label>

      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={f.id} className="flex gap-2 items-center">
            <select {...register(`payments.${i}.paymentAccountId`)} className={`${inputCls} flex-1`}>
              {paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input
              {...register(`payments.${i}.amount`)}
              type="number" min="0" inputMode="numeric" placeholder="Monto"
              disabled={singleSimple}
              className={`${inputCls} w-28 sm:w-32 text-right tabular-nums disabled:opacity-60`}
            />
            {fields.length > 1 && (
              <button type="button" onClick={() => remove(i)} className="text-slate-400 hover:text-red-500 p-1 flex-none" aria-label="Quitar medio">
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => append({ paymentAccountId: paymentAccounts?.[0]?.id || '', amount: '' })}
        className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400 hover:underline mt-2"
      >
        <Plus size={12} /> Agregar otro medio
      </button>

      {/* Crédito con el proveedor */}
      <label className="flex items-center gap-2.5 mt-3 cursor-pointer select-none">
        <input type="checkbox" {...register('credit')} className="w-4 h-4 rounded accent-emerald-600" />
        <span className="text-[13px] text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <HandCoins size={14} className="text-amber-500" /> Queda debiendo al proveedor (crédito)
        </span>
      </label>
      {credit && (
        <div className="mt-2 pl-6">
          <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Fecha de pago acordada (opcional)</label>
          <input {...register('creditDueDate')} type="date" className={`${inputCls} max-w-[200px]`} />
        </div>
      )}

      {/* Resumen */}
      <div className="mt-3 rounded-xl bg-slate-50 dark:bg-white/[0.03] px-3 py-2.5 text-[12px] flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-slate-500 dark:text-slate-400">Total: <b className="text-slate-800 dark:text-white tabular-nums">{formatCurrency(total || 0)}</b></span>
        <span className="text-slate-500 dark:text-slate-400">Pagado ahora: <b className="text-slate-800 dark:text-white tabular-nums">{formatCurrency(paidSum)}</b></span>
        {credit && <span className="text-amber-600 dark:text-amber-400">A crédito: <b className="tabular-nums">{formatCurrency(creditAmount)}</b></span>}
      </div>
      {descuadre && (
        <p className="mt-1.5 text-[12px] text-red-500">Los pagos deben sumar el total, o marca que queda a crédito.</p>
      )}
    </div>
  );
}
