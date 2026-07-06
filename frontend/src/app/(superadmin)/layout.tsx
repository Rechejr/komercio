'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Shield, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, accessToken, user, setAccessToken, restoreSession, logout } = useAuthStore();
  const [isRestoring, setIsRestoring] = useState(true);
  const didRestore = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (didRestore.current) return;
    didRestore.current = true;

    if (accessToken) {
      setIsRestoring(false);
      return;
    }

    api.post('/auth/refresh-token')
      .then(async ({ data }) => {
        const newToken = data.data.accessToken;
        setAccessToken(newToken);
        if (!isAuthenticated) {
          const me = await api.get('/auth/me');
          restoreSession({ ...me.data.data, plan: 'free' }, newToken);
        }
      })
      .catch(() => logout())
      .finally(() => setIsRestoring(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isRestoring && isAuthenticated && user?.role !== 'SUPER_ADMIN') {
      router.replace('/dashboard');
    }
  }, [isRestoring, isAuthenticated, user, router]);

  if (isRestoring) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950">
        <Loader2 size={32} className="animate-spin text-emerald-500" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'SUPER_ADMIN') return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
            <Shield size={16} />
          </div>
          <div>
            <span className="font-bold text-white">Ventrix</span>
            <span className="ml-2 text-xs bg-red-600/20 text-red-400 px-2 py-0.5 rounded-full font-medium">
              Super Admin
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">{user?.name}</span>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition-colors"
          >
            <LogOut size={15} />
            Salir
          </button>
        </div>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
