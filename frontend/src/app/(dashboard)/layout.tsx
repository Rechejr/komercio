'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { PlanExpiryBanner } from '@/components/layout/PlanExpiryBanner';
import { InstallAppPrompt } from '@/components/pwa/InstallAppPrompt';
import { OnboardingWelcome } from '@/components/onboarding/OnboardingWelcome';
import { UpgradeModal } from '@/components/ui/UpgradeModal';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, accessToken, setAccessToken, restoreSession, expireSession } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Always start in "restoring" state — the effect decides immediately if restore is needed
  const [isRestoring, setIsRestoring] = useState(true);
  const didRestore = useRef(false);
  useSocket();

  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;

    // Token already in memory (e.g. navigating within the app) — nothing to restore
    if (accessToken) {
      setIsRestoring(false);
      return;
    }

    // Safety net: if restore takes > 10s something is wrong — redirect to login
    const safetyTimer = setTimeout(() => {
      setIsRestoring(false);
      expireSession();
    }, 10000);

    // No token in memory — try to recover the session via the httpOnly refresh cookie
    api
      .post('/auth/refresh-token')
      .then(async ({ data }) => {
        const newToken = data.data.accessToken;
        setAccessToken(newToken);

        // User data may be missing when Zustand state was lost (new tab, cleared storage)
        if (!isAuthenticated) {
          const me = await api.get('/auth/me');
          const userData = me.data.data;
          restoreSession({
            ...userData,
            businessId: userData.branch?.business?.id,
            businessName: userData.branch?.business?.name,
            plan: userData.branch?.business?.plan || 'free',
            businessType: userData.branch?.business?.type || 'pos',
          }, newToken, userData.accounts);
        }
      })
      .catch(() => expireSession())
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
  // Guarda de producto: este tablero es solo del POS. Una cuenta contable que
  // llegue aquí (link viejo, URL escrita a mano) se rebota a su propio tablero.
  if (currentUser?.businessType === 'contable') {
    if (typeof window !== 'undefined') window.location.replace('/contable/panel');
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <div className="print-hide">
        <Sidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />
      </div>
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <div className="print-hide">
          <Header onMenuClick={() => setMobileMenuOpen(true)} />
        </div>
        <main className="flex-1 overflow-auto p-4 md:p-6 animate-fade-in">
          <InstallAppPrompt />
          <OnboardingWelcome />
          <PlanExpiryBanner />
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
        </main>
      </div>
      <UpgradeModal />
    </div>
  );
}
