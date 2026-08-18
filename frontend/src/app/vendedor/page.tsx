'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { sellerFetch, getSellerToken, clearSellerToken } from '@/lib/sellerApi';
import { Loader2, UserPlus, LogOut, Copy, Check, Store, Calculator, RefreshCw, Download, KeyRound, X } from 'lucide-react';
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon';
import { downloadCsv } from '@/lib/exportCsv';
import { AvisosVendedora } from '@/components/vendedor/AvisosVendedora';
import toast from 'react-hot-toast';

type Period = 'monthly' | 'quarterly' | 'annual';
interface ProvisionResult { name: string; email: string; password: string; businessType: string; businessName: string; loginUrl: string }
interface Account { id: string; name: string; type: string; plan: string; planExpiresAt: string | null; createdAt: string; owner: { name: string; email: string } }
// Compra hecha por el link de la vendedora: el cliente pagó solo y el sistema le
// creó la cuenta. Aquí ella ve a quién escribirle si el correo no llegó.
interface Compra {
  id: string; buyerName: string; buyerLastName: string; buyerEmail: string; buyerPhone: string;
  productType: string; period: string; amount: number; status: string; errorMessage: string | null;
  createdAt: string; provisionedAt: string | null;
}

const PERIOD_LABEL: Record<Period, string> = { monthly: 'Mensual', quarterly: 'Trimestral', annual: 'Anual' };

// Comisión: 30% del primer pago, con tope de $40.000 en planes anuales. Se deriva
// el plan/periodo de cada cuenta a partir de su duración (planExpiresAt-createdAt).
const COMMISSION_RATE = 0.30;
const ANNUAL_CAP = 40000;
const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

function planInfo(a: Account): { periodLabel: string; price: number; commission: number } {
  const created = new Date(a.createdAt).getTime();
  const expires = a.planExpiresAt ? new Date(a.planExpiresAt).getTime() : created;
  const months = Math.max(1, Math.round((expires - created) / (30 * 24 * 60 * 60 * 1000)));
  let price: number; let periodLabel: string; let isAnnual = false;
  if (a.type === 'contable') { price = 120000; periodLabel = 'Anual'; isAnnual = true; }
  else if (months >= 12) { price = 287000; periodLabel = 'Anual'; isAnnual = true; }
  else if (months >= 3) { price = 80700; periodLabel = 'Trimestral'; }
  else { price = 29900; periodLabel = 'Mensual'; }
  let commission = Math.round(price * COMMISSION_RATE);
  if (isAnnual) commission = Math.min(commission, ANNUAL_CAP);
  return { periodLabel, price, commission };
}

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
  const [compras, setCompras] = useState<Compra[]>([]);
  const [linkCopiado, setLinkCopiado] = useState(false);

  // Cambiar contraseña
  const [showPwd, setShowPwd] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);

  const loadAccounts = useCallback(() => {
    sellerFetch<Account[]>('/accounts').then(setAccounts).catch(() => {});
    sellerFetch<Compra[]>('/compras').then(setCompras).catch(() => {});
  }, []);

  useEffect(() => {
    if (!getSellerToken()) { router.replace('/vendedor/login'); return; }
    sellerFetch<{ name: string; slug: string; phone?: string }>('/me')
      .then((me) => { setSeller(me); setReady(true); loadAccounts(); })
      .catch(() => { clearSellerToken(); router.replace('/vendedor/login'); });
  }, [router, loadAccounts]);

  function logout() { clearSellerToken(); router.replace('/vendedor/login'); }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) { toast.error('La contraseña debe tener mínimo 8 caracteres'); return; }
    if (newPwd !== newPwd2) { toast.error('Las contraseñas no coinciden'); return; }
    setChangingPwd(true);
    try {
      await sellerFetch('/change-password', { method: 'POST', body: JSON.stringify({ newPassword: newPwd }) });
      toast.success('Contraseña actualizada');
      setShowPwd(false); setNewPwd(''); setNewPwd2('');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo cambiar la contraseña');
    } finally {
      setChangingPwd(false);
    }
  }

  const totalComision = accounts.reduce((s, a) => s + planInfo(a).commission, 0);
  function descargarComisiones() {
    if (accounts.length === 0) { toast.error('Aún no hay cuentas para descargar'); return; }
    const rows = accounts.map((a) => {
      const p = planInfo(a);
      return [
        a.owner?.name || '',
        a.owner?.email || '',
        a.type === 'contable' ? 'Contable' : 'POS',
        p.periodLabel,
        new Date(a.createdAt).toLocaleDateString('es-CO'),
        Math.round(p.price),
        Math.round(p.commission),
      ];
    });
    const totalPrecio = accounts.reduce((s, a) => s + planInfo(a).price, 0);
    rows.push(['', '', '', '', 'TOTAL', Math.round(totalPrecio), Math.round(totalComision)]);
    downloadCsv(
      `comisiones-${seller?.slug || 'vendedora'}-${new Date().toISOString().slice(0, 10)}`,
      ['Cliente', 'Correo', 'Producto', 'Plan', 'Fecha', 'Precio pagado', 'Comisión (30%)'],
      rows,
    );
  }

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

  const miLink = `https://ventrix.lat/planes?v=${seller?.slug || ''}`;
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
          <div className="flex items-center gap-3">
            <button onClick={() => { setShowPwd(true); setNewPwd(''); setNewPwd2(''); }} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-emerald-600 dark:text-slate-400 transition"><KeyRound size={15} /> <span className="hidden sm:inline">Cambiar clave</span></button>
            <button onClick={logout} className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-red-600 dark:text-slate-400 transition"><LogOut size={15} /> Salir</button>
          </div>
        </div>
      </header>

      {/* Modal cambiar contraseña */}
      {showPwd && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4" onClick={() => setShowPwd(false)}>
          <form onClick={(e) => e.stopPropagation()} onSubmit={changePassword} className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-modal p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-slate-800 dark:text-white flex items-center gap-2"><KeyRound size={16} className="text-emerald-600" /> Cambiar contraseña</h3>
              <button type="button" onClick={() => setShowPwd(false)} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} /></button>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Nueva contraseña</label>
              <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className={input} placeholder="Mínimo 8 caracteres" autoComplete="new-password" required />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Repite la contraseña</label>
              <input type="password" value={newPwd2} onChange={(e) => setNewPwd2(e.target.value)} className={input} placeholder="••••••••" autoComplete="new-password" required />
            </div>
            <button type="submit" disabled={changingPwd} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-60 transition">
              {changingPwd ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={15} />} Guardar
            </button>
          </form>
        </div>
      )}

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Tu link de ventas — el camino principal: el cliente paga solo y el
            sistema le crea la cuenta y le manda las claves por correo. */}
        <div className="bg-emerald-600 text-white rounded-2xl p-6">
          <h2 className="text-[15px] font-bold flex items-center gap-2 mb-1"><Store size={17} /> Tu link de ventas</h2>
          <p className="text-[13px] text-emerald-50 mb-4">
            Compártelo por WhatsApp. El cliente elige su plan, deja sus datos y paga:
            el sistema le crea la cuenta y le envía usuario y contraseña al correo. Tú no
            tienes que hacer nada más, y la venta te queda registrada abajo.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="flex-1 min-w-[240px] bg-white/15 rounded-xl px-3.5 py-2.5 text-[13px] font-mono break-all">{miLink}</code>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(miLink); setLinkCopiado(true); toast.success('Link copiado'); setTimeout(() => setLinkCopiado(false), 2000); }}
              className="flex items-center gap-1.5 bg-white text-emerald-700 font-semibold px-4 py-2.5 rounded-xl text-[13px] hover:bg-emerald-50 transition"
            >
              {linkCopiado ? <Check size={15} /> : <Copy size={15} />} {linkCopiado ? 'Copiado' : 'Copiar'}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Hola! Te comparto los planes de Ventrix para que elijas el que más te sirva: ${miLink}`)}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-emerald-700 font-semibold px-4 py-2.5 rounded-xl text-[13px] hover:bg-emerald-800 transition"
            >
              <WhatsAppIcon /> Compartir
            </a>
          </div>
        </div>

        <AvisosVendedora />

        {/* Compras hechas por su link */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[15px] font-bold text-slate-800 dark:text-white flex items-center gap-2"><Store size={17} className="text-emerald-600" /> Compras por tu link</h2>
            <button onClick={loadAccounts} className="text-slate-400 hover:text-emerald-600 transition p-1" aria-label="Actualizar"><RefreshCw size={15} /></button>
          </div>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
            El correo con las claves a veces cae en spam: si el cliente no te confirma, escríbele por WhatsApp.
          </p>

          {compras.length === 0 ? (
            <p className="text-[13px] text-slate-400 dark:text-slate-500 py-6 text-center">Aún no hay compras por tu link.</p>
          ) : (
            <div className="space-y-2.5">
              {compras.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 border border-slate-100 dark:border-slate-700 rounded-xl px-3.5 py-3">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-[14px] font-semibold text-slate-800 dark:text-white">{c.buyerName} {c.buyerLastName}</p>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 break-all">{c.buyerEmail}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{money(c.amount)}</p>
                    <p className="text-[11px] text-slate-400">{c.productType === 'contable' ? 'Contable' : 'POS'} · {PERIOD_LABEL[c.period as Period] || c.period}</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg whitespace-nowrap ${
                    c.status === 'provisioned' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      : c.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                  }`}>
                    {c.status === 'provisioned' ? 'Cuenta creada' : c.status === 'failed' ? 'Revisar' : 'Esperando pago'}
                  </span>
                  {c.buyerPhone && (
                    <a
                      href={`https://wa.me/${c.buyerPhone.startsWith('57') ? c.buyerPhone : `57${c.buyerPhone}`}?text=${encodeURIComponent(`Hola ${c.buyerName}! Soy ${seller?.name?.split(' ')[0] || 'de Ventrix'}. Tu cuenta de Ventrix ya está lista: te llegó al correo ${c.buyerEmail} el usuario y la contraseña (revisa también la carpeta de spam). ¿Pudiste entrar?`)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-2 rounded-lg text-[12px] transition"
                    >
                      <WhatsAppIcon /> Escribirle
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Crear cuenta */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <h2 className="text-[15px] font-bold text-slate-800 dark:text-white flex items-center gap-2 mb-1"><UserPlus size={17} className="text-emerald-600" /> Crear una cuenta a mano</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mb-4">
            Solo si el cliente <b>pagó por fuera</b> (otro link de Wompi, Nequi o transferencia).
            Con el n.° de la transacción el sistema <b>verifica el pago</b> y crea la cuenta.
            Si compró por tu link, no hace falta: la cuenta se crea sola.
          </p>

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

        {/* Cuentas creadas + comisiones */}
        <div className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[15px] font-bold text-slate-800 dark:text-white">Cuentas creadas y comisiones</h2>
            <div className="flex items-center gap-2">
              <button onClick={descargarComisiones} className="flex items-center gap-1.5 text-[12.5px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition"><Download size={14} /> Descargar</button>
              <button onClick={loadAccounts} className="text-slate-400 hover:text-emerald-600 transition p-1.5" title="Actualizar"><RefreshCw size={15} /></button>
            </div>
          </div>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-3">Comisión: 30% del primer pago (tope $40.000 en planes anuales).</p>

          {accounts.length === 0 ? (
            <p className="text-[13px] text-slate-400 py-6 text-center">Aún no has creado cuentas.</p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 px-4 py-2.5 mb-3">
                <span className="text-[13px] font-medium text-emerald-800 dark:text-emerald-300">Total en comisiones ({accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'})</span>
                <span className="text-[16px] font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">{money(totalComision)}</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {accounts.map((a) => {
                  const p = planInfo(a);
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13.5px] font-medium text-slate-800 dark:text-white truncate">{a.owner?.name} <span className="text-slate-400 font-normal">· {a.owner?.email}</span></p>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400">{a.type === 'contable' ? 'Contable' : 'POS'} · {p.periodLabel} · {new Date(a.createdAt).toLocaleDateString('es-CO')}</p>
                      </div>
                      <div className="text-right flex-none">
                        <p className="text-[13px] font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{money(p.commission)}</p>
                        <p className="text-[11px] text-slate-400">de {money(p.price)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
