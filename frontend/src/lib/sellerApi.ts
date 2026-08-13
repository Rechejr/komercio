// Cliente API del portal de vendedoras. Usa su PROPIO token (kind:'seller'),
// separado del token de usuarios de la app. Token en localStorage (herramienta
// interna de bajo tráfico).
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';
const TOKEN_KEY = 'ventrix-seller-token';

export function getSellerToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
}
export function setSellerToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearSellerToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function sellerFetch<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = getSellerToken();
  const res = await fetch(`${API}/seller${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || 'Ocurrió un error');
  return json.data as T;
}
