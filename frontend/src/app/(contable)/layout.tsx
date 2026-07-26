'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { ContableSidebar } from '@/components/contable/ContableSidebar';
import { AgendaAlertas } from '@/components/contable/AgendaAlertas';
import { Header } from '@/components/layout/Header';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

/**
 * Layout del tablero de Ventrix Contable.
 *
 * Restaura la sesión igual que el layout del POS (mismo auth, misma cookie de
 * refresh), pero es exclusivo de las cuentas `contable`: una cuenta POS que
 * llegue aquí se rebota a /dashboard. Es la guarda espejo de la del POS.
 */
export default function ContableLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, accessToken, setAccessToken, restoreSession, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const didRestore = useRef(false);

  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;

    if (accessToken) {
      setIsRestoring(false);
      return;
    }

    const safetyTimer = setTimeout(() => {
      setIsRestoring(false);
      logout();
    }, 10000);

    api
      .post('/auth/refresh-token')
      .then(async ({ data }) => {
        const newToken = data.data.accessToken;
        setAccessToken(newToken);

        if (!isAuthenticated) {
          const me = await api.get('/auth/me');
          const userData = me.data.data;
          restoreSession({
            ...userData,
            businessId: userData.branch?.business?.id,
            businessName: userData.branch?.business?.name,
            plan: userData.branch?.business?.plan || 'free',
            businessType: userData.branch?.business?.type || 'pos',
          }, newToken);
        }
      })
      .catch(() => logout())
      .finally(() => { clearTimeout(safetyTimer); setIsRestoring(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isRestoring) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 size={32} className="animate-spin text-emerald-600" />
          <p className="text-sm">Restaurando sesión...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;
  const currentUser = useAuthStore.getState().user;
  if (currentUser?.role === 'SUPER_ADMIN') {
    if (typeof window !== 'undefined') window.location.replace('/superadmin');
    return null;
  }
  // Guarda de producto espejo: este tablero es solo de cuentas contables. Una
  // cuenta de comercio que llegue aquí vuelve a su POS.
  if (currentUser?.businessType !== 'contable') {
    if (typeof window !== 'undefined') window.location.replace('/dashboard');
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <div className="print-hide">
        <ContableSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="print-hide">
          <Header onMenuClick={() => setMobileMenuOpen(true)} />
        </div>
        <main className="flex-1 overflow-auto p-4 md:p-6 animate-fade-in">
          <ErrorBoundary>
            <AgendaAlertas />
            {children}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
