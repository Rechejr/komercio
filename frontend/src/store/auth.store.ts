import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  branchId?: string;
  businessId?: string;
  businessName?: string;
  plan?: string;
  isEmailVerified?: boolean;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  setUser: (user: User) => void;
  setAccessToken: (token: string) => void;
  login: (user: User, token: string, rememberMe?: boolean) => void;
  restoreSession: (user: User, accessToken: string) => void;
  logout: () => void;
}

const REMEMBER_KEY = 'ventrix-remember';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

// Saves to localStorage if "remember me" is on, otherwise sessionStorage (clears on tab close)
const smartStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(name) ?? sessionStorage.getItem(name);
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(REMEMBER_KEY) === 'true') {
      localStorage.setItem(name, value);
      sessionStorage.removeItem(name);
    } else {
      sessionStorage.setItem(name, value);
      localStorage.removeItem(name);
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,
      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      login: (user, accessToken, rememberMe = false) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem(REMEMBER_KEY, String(rememberMe));
          // Non-sensitive flag cookie so Next.js middleware can redirect unauthenticated users
          // server-side. This is NOT an auth token — real auth is enforced by the backend.
          const maxAge = rememberMe ? 60 * 60 * 24 * 30 : 0; // 30 days or session
          document.cookie = `logged_in=1; path=/; SameSite=Lax${maxAge ? `; max-age=${maxAge}` : ''}`;
        }
        set({ user, accessToken, isAuthenticated: true });
      },
      // Used on page load to restore session without touching the rememberMe preference
      restoreSession: (user, accessToken) => set({ user, accessToken, isAuthenticated: true }),
      logout: () => {
        set({ user: null, accessToken: null, isAuthenticated: false });
        if (typeof window !== 'undefined') {
          localStorage.removeItem(REMEMBER_KEY);
          document.cookie = 'logged_in=; path=/; max-age=0';
          // MUST wait for server to clear the httpOnly cookie before redirecting.
          // If we redirect first, the middleware sees the stale cookie and sends
          // the user back to /dashboard → infinite redirect loop → blank page.
          // But the fetch itself has no native timeout — if the backend is slow
          // or unreachable (e.g. paused under a debugger), it can hang forever
          // and the redirect below would never fire. AbortController caps it.
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 5000);
          fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include', signal: controller.signal })
            .catch(() => {})
            .finally(() => { clearTimeout(timer); window.location.href = '/login'; });
        }
      },
    }),
    {
      name: 'ventrix-auth',
      storage: createJSONStorage(() => smartStorage),
      // accessToken is intentionally excluded — it lives in memory only (never in localStorage/sessionStorage)
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
