'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sellerFetch, setSellerToken } from '@/lib/sellerApi';
import { Loader2, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

export default function VendedorLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await sellerFetch<{ token: string }>('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setSellerToken(data.token);
      router.replace('/vendedor');
    } catch (err: any) {
      toast.error(err.message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  const input = 'w-full px-3.5 py-2.5 rounded-xl border bg-slate-50 border-slate-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 dark:bg-slate-800 dark:border-slate-700 dark:text-white';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white font-black text-xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-600/30">V</div>
          <h1 className="mt-4 text-xl font-bold text-slate-800 dark:text-white">Portal de vendedoras</h1>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1">Ventrix · crea cuentas para tus clientes</p>
        </div>

        <form onSubmit={onSubmit} className="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 space-y-4 shadow-sm">
          <div>
            <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Correo</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="tunombre@ventrix.lat" autoComplete="username" required />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">Contraseña</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} placeholder="••••••••" autoComplete="current-password" required />
          </div>
          <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold disabled:opacity-60 transition">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={15} />} Iniciar sesión
          </button>
        </form>
      </div>
    </div>
  );
}
