'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { sellerFetch, getSellerToken, clearSellerToken } from '@/lib/sellerApi';
import { Loader2, UserPlus, LogOut, Copy, Check, Store, Calculator, RefreshCw } from 'lucide-react';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import toast from 'react-hot-toast';

type Period = 'monthly' | 'quarterly' | 'annual';
interface ProvisionResult { name: string; email: string; password: string; businessType: string; businessName: string; loginUrl: string }
interface Account { id: string; name: string; type: string; plan: string; planExpiresAt: string | null; createdAt: string; owner: { name: string; email: string } }

const PERIOD_LABEL: Record<Period, string> = { monthly: 'Mensual', quarterly: 'Trimestral', annual: 'Anual' };

export default function VendedorPortalPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [seller, setSeller] = useState<{ name: string; slug: string; phone?: string } | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [product, setProduct] = useState<'pos' | 'contable'>('pos');
  const [period, setPeriod] = useState<Period>('monthly');
  const [transactionId, setTransactionId] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [copied, setCopied] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);

  const loadAccounts = useCallback(() => {
    sellerFetch<Account[]>('/accounts').then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!getSellerToken()) { router.replace('/vendedor/login'); return; }
    sellerFetch<{ name: string; slug: string; phone?: string }>('/me')
      .then((me) => { setSeller(me); setReady(true); loadAccounts(); })
      .catch(() => { clearSellerToken(); router.replace('/vendedor/login'); });
  }, [router, loadAccounts]);

  function logout() { clearSellerToken(); router.replace('/vendedor/login'); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setResult(null);
    try {
      const data = await sellerFetch<ProvisionResult>('/provision', {
        method: 'POST',
        body: JSON.stringify({ name, email, businessType: product, period: product === 'contable' ? 'annual' : period, transactionId: transactionId.trim() }),
      });
      setResult(data);
      setName(''); setEmail(''); setTransactionId('');
      loadAccounts();
      toast.success('Cuenta creada');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo crear la cuenta');
    } finally {
      setSaving(false);
    }
  }

  function credentialsMessage(r: ProvisionResult): string {
    return `¡Bienvenido a Ventrix! 🎉 Ya te creamos tu cuenta de ${r.businessType === 'contable' ? 'Contable' : 'POS'}:\n\n📧 Correo: ${r.email}\n🔑 Contraseña: ${r.password}\n\nEntra en https://${r.loginUrl}\n\nPor seguridad, cambia tu contraseña cuando ingreses (Configuración). ¡Cualquier duda, aquí estoy!`;
  }
  function copyCreds() {
    if (!result) return;
    navigator.clipboard.writeText(credentialsMessage(result)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
      toast.success('Credenciales copiadas');
    });
  }
  function waSend() {
    if (!result) return;
    const digits = phone.replace(/\D/g, '');
    const num = digits ? (digits.startsWith('57') ? digits : `57${digits}`) : '';
    const url = num
      ? `https://wa.me/${num}?text=${encodeURIComponent(credentialsMessage(result))}`
      : `https://wa.me/?text=${encodeURIComponent(credentialsMessage(result))}`;
    window.open(url, '_blank', 'noopener');
  }

  if (!ready) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900"><Loader2 className="animate-spin text-emerald-600" /></div>;
  }

  const input = 'w-full px-3.5 py-2.5 rounded-xl border bg-slate-50 border-slate-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="bg-white dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white font-black flex items-center justify-center">V</div>
            <div>
              <p className="text-[14px] font-bold text-slate-800 dark:text-white leading-tight">Portal de vendedoras</p>
              <p className="text-[12px] text-slate-500 dark:text-slate-400">Hola, {seller?.name} · tu link: ventrix.lat/planes?v={seller?.slug}</p>
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-red-600 dark:text-slate-400 transition"><LogOut size={15} /> Salir</button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Crear cuenta */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <h2 className="text-[15px] font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-1"><UserPlus size={17} className="text-emerald-600" /> Crear cuenta de cliente</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">El cliente paga por tu link de Wompi; con el n.° de la transacción, el sistema <b>verifica el pago</b> y crea la cuenta lista para enviársela por WhatsApp.</p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Nombre del cliente</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={input} placeholder="Ej: Doña Marta" required />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Correo del cliente</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="cliente@correo.com" required />
              </div>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Producto</label>
              <div className="grid grid-cols-2 gap-2">
                {(['pos', 'contable'] as const).map((p) => (
                  <button key={p} type="button" onClick={() => setProduct(p)}
                    className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border text-[14px] font-semibold transition ${product === p ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                    {p === 'pos' ? <Store size={16} /> : <Calculator size={16} />} {p === 'pos' ? 'POS' : 'Contable'}
                  </button>
                ))}
              </div>
            </div>

            {product === 'pos' && (
              <div>
                <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Periodo pagado</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['monthly', 'quarterly', 'annual'] as Period[]).map((p) => (
                    <button key={p} type="button" onClick={() => setPeriod(p)}
                      className={`py-2 rounded-xl border text-[13px] font-semibold transition ${period === p ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                      {PERIOD_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">N.° de transacción de Wompi <span className="text-red-500">*</span></label>
              <input value={transactionId} onChange={(e) => setTransactionId(e.target.value)} className={input} placeholder="Ej: 01-1700000000-12345" required />
              <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                El del comprobante que te envía el cliente tras pagar. La cuenta <b>solo se crea si ese pago está aprobado</b> y por el monto del plan.
              </p>
            </div>

            <div>
              <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">WhatsApp del cliente <span className="text-slate-400 font-normal">(opcional, para enviarle las claves)</span></label>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={input} placeholder="3001234567" inputMode="numeric" />
            </div>

            <button type="submit" disabled={saving} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-60 transition">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Crear cuenta {product === 'contable' ? 'Contable (anual)' : `POS (${PERIOD_LABEL[period].toLowerCase()})`}
            </button>
          </form>

          {/* Resultado con credenciales */}
          {result && (
            <div className="mt-5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/15 p-4">
              <p className="text-[13px] font-bold text-emerald-800 dark:text-emerald-300 mb-2">✅ Cuenta creada para {result.name}</p>
              <div className="text-[13.5px] text-slate-700 dark:text-slate-200 space-y-1 font-mono bg-white dark:bg-slate-800 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800/50">
                <p>📧 {result.email}</p>
                <p>🔑 {result.password}</p>
                <p className="text-[12px] text-slate-500">Entra en https://{result.loginUrl}</p>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={copyCreds} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800">
                  {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />} Copiar
                </button>
                <button onClick={waSend} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-[13px] font-semibold">
                  <WhatsAppIcon /> Enviar por WhatsApp
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">⚠️ Guarda o envía la contraseña ahora — no se vuelve a mostrar.</p>
            </div>
          )}
        </div>

        {/* Cuentas creadas */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-bold text-slate-800 dark:text-white">Cuentas que has creado</h2>
            <button onClick={loadAccounts} className="text-slate-400 hover:text-emerald-600 transition" title="Actualizar"><RefreshCw size={15} /></button>
          </div>
          {accounts.length === 0 ? (
            <p className="text-[13px] text-slate-400 py-6 text-center">Aún no has creado cuentas.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-slate-800 dark:text-white truncate">{a.owner?.name} <span className="text-slate-400 font-normal">· {a.owner?.email}</span></p>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">{a.type === 'contable' ? 'Contable' : 'POS'} · {a.name}</p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex-none">{a.plan === 'pro' ? 'Pro' : 'Free'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
