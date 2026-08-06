import { api } from './api';
import { useAuthStore } from '@/store/auth.store';

// A qué tablero va cada producto tras iniciar sesión o cambiar de cuenta.
export function homeForBusinessType(t?: string) {
  return t === 'contable' ? '/contable/panel' : '/dashboard';
}

// Cambia la cuenta activa (POS ↔ Contable) del mismo correo: pide un token nuevo
// apuntando al negocio elegido, actualiza el store y navega con recarga completa
// para limpiar la caché de datos del negocio anterior (todo es multi-tenant).
export async function switchToAccount(businessId: string) {
  const res = await api.post('/auth/switch-business', { businessId });
  const { user, accessToken, accounts } = res.data.data;
  const store = useAuthStore.getState();
  store.setAccessToken(accessToken);
  store.setUser(user);
  if (accounts) store.setAccounts(accounts);
  window.location.href = homeForBusinessType(user.businessType);
}

// Activa el otro producto bajo el MISMO login (sin pedir otro correo ni clave) y
// refresca la lista de cuentas para que el switcher lo muestre al instante.
export async function activarProducto(businessName: string, businessType: 'pos' | 'contable') {
  const res = await api.post('/auth/activar-producto', { businessName, businessType });
  try {
    const me = await api.get('/auth/me');
    if (me.data?.data?.accounts) useAuthStore.getState().setAccounts(me.data.data.accounts);
  } catch {
    // Si /me falla, no es crítico: el switcher se actualizará en el próximo login.
  }
  return res.data.data as { businessId: string; businessType: string; businessName: string };
}
