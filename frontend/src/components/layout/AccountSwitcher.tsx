'use client';

import { useMemo, useState } from 'react';
import { useAuthStore, type Account } from '@/store/auth.store';
import { switchToAccount, activarProducto } from '@/lib/accounts';
import { Portal } from '@/components/ui/Portal';
import toast from 'react-hot-toast';
import { Store, Calculator, Check, Plus, X, Loader2, ArrowLeftRight, ArrowRight } from 'lucide-react';

type ProductType = 'pos' | 'contable';

const META: Record<ProductType, { label: string; desc: string; Icon: typeof Store }> = {
  pos: { label: 'Ventrix POS', desc: 'Punto de venta', Icon: Store },
  contable: { label: 'Ventrix Contable', desc: 'Agenda tributaria', Icon: Calculator },
};

// Switcher de cuenta (POS ↔ Contable) + activación del producto que falte, para
// un mismo correo. Se coloca en las acciones inferiores de ambos sidebars (ambos
// oscuros), con el mismo estilo que "Cerrar sesión" / "Colapsar".
export function AccountSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { user, accounts } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [activating, setActivating] = useState<ProductType | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // Si la lista de cuentas aún no llegó (sesión previa a esta versión), se asume
  // solo el producto actual para no ofrecer "activar" el que ya tiene.
  const effective: Account[] = useMemo(() => {
    if (accounts && accounts.length > 0) return accounts;
    if (user?.businessType) {
      return [{ businessId: user.businessId || '', businessType: user.businessType, businessName: user.businessName }];
    }
    return [];
  }, [accounts, user]);

  const hasPos = effective.some((a) => a.businessType === 'pos');
  const hasContable = effective.some((a) => a.businessType === 'contable');
  const missing: ProductType | null = !hasPos ? 'pos' : !hasContable ? 'contable' : null;

  const canSwitch = effective.length > 1;
  const canActivate = isAdmin && !!missing;
  if (!canSwitch && !canActivate) return null;

  const doSwitch = async (acc: Account) => {
    if (acc.businessType === user?.businessType) { setOpen(false); return; }
    setSwitching(acc.businessId);
    try {
      await switchToAccount(acc.businessId); // reemite token y recarga a su tablero
    } catch {
      toast.error('No se pudo cambiar de cuenta');
      setSwitching(null);
    }
  };

  const doActivate = async () => {
    if (!activating || !newName.trim()) return;
    setBusy(true);
    try {
      const created = await activarProducto(newName.trim(), activating);
      // Entra directo al producto recién activado para empezar a configurarlo
      // (reemite el token y recarga a su tablero). No hace falta un paso extra.
      await switchToAccount(created.businessId);
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'No se pudo activar el producto');
      setBusy(false);
    }
  };

  const triggerCls = [
    'flex items-center gap-2.5 w-full px-2.5 py-[7px] rounded-md text-[13px]',
    'text-slate-600 hover:text-emerald-400 hover:bg-emerald-400/5 transition-colors duration-150',
    collapsed ? 'md:justify-center md:px-0' : '',
  ].join(' ');

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerCls} title="Cambiar de cuenta">
        <ArrowLeftRight size={14} className="flex-shrink-0" />
        <span className={collapsed ? 'md:hidden' : ''}>{canSwitch ? 'Cambiar de cuenta' : 'Activar otro producto'}</span>
      </button>

      {open && (
        <Portal>
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4" onClick={() => !busy && setOpen(false)}>
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
            <div
              className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-modal w-full max-w-sm max-h-[90vh] overflow-hidden flex flex-col animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 dark:border-white/[0.06] flex-shrink-0">
                <h2 className="text-[15px] font-bold text-slate-900 dark:text-white">Tus cuentas</h2>
                <button onClick={() => !busy && setOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={19} /></button>
              </div>

              <div className="px-4 py-3 overflow-y-auto flex-1 space-y-1.5">
                {effective.map((acc) => {
                  const m = META[(acc.businessType as ProductType)] || META.pos;
                  const active = acc.businessType === user?.businessType;
                  const loading = switching === acc.businessId;
                  return (
                    <button
                      key={acc.businessId}
                      onClick={() => doSwitch(acc)}
                      disabled={!!switching}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition text-left disabled:opacity-60 ${
                        active
                          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                          : 'border-slate-100 dark:border-white/[0.06] hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center flex-none">
                        <m.Icon size={17} className="text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">{acc.businessName || m.label}</p>
                        <p className="text-[11px] text-slate-400">{m.label}</p>
                      </div>
                      {active
                        ? <Check size={16} className="text-emerald-600 dark:text-emerald-400 flex-none" />
                        : loading
                          ? <Loader2 size={16} className="animate-spin text-emerald-600 flex-none" />
                          : <ArrowRight size={15} className="text-slate-300 dark:text-slate-600 flex-none" />}
                    </button>
                  );
                })}

                {/* Activar el producto que falta */}
                {canActivate && activating === null && (
                  <button
                    onClick={() => { setActivating(missing); setNewName(''); }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition text-left mt-1"
                  >
                    <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-none">
                      <Plus size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate">Activar {META[missing!].label}</p>
                      <p className="text-[11px] text-slate-400">Con este mismo correo y contraseña</p>
                    </div>
                  </button>
                )}

                {/* Formulario de activación */}
                {activating !== null && (
                  <div className="mt-1 p-3 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/[0.06] space-y-2.5">
                    <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                      Nombre {activating === 'contable' ? 'de tu oficina contable' : 'de tu negocio'}
                    </p>
                    <input
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') doActivate(); }}
                      placeholder={activating === 'contable' ? 'Ej: Contaduría López' : 'Ej: Tienda La Esquina'}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[16px] sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:text-white"
                    />
                    <div className="flex gap-2">
                      <button onClick={() => { setActivating(null); setNewName(''); }} disabled={busy} className="flex-1 py-2 rounded-lg text-[13px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60">
                        Cancelar
                      </button>
                      <button onClick={doActivate} disabled={busy || !newName.trim()} className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Activar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
