import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from '../auth.store';

// La sesión es donde vivió el bug de "se cae la sesión en el celular": qué se
// guarda, dónde, y qué se borra al salir. Estas pruebas fijan ese contrato.

const usuario = {
  id: 'u1', name: 'Cristian', email: 'admin@ventrix.lat', role: 'ADMIN',
  businessId: 'b1', businessType: 'pos',
};
const cuentas = [
  { businessId: 'b1', businessType: 'pos', businessName: 'Mi Tienda' },
  { businessId: 'b2', businessType: 'contable', businessName: 'Mi Contable' },
];

const store = () => useAuthStore.getState();
const guardado = () => JSON.parse(localStorage.getItem('ventrix-auth') || sessionStorage.getItem('ventrix-auth') || '{}');

// jsdom no navega de verdad: se reemplaza location para poder comprobar a dónde
// manda la app (y de paso callar el "Not implemented: navigation").
let location: { href: string; pathname: string };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = 'logged_in=; path=/; max-age=0';
  useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false, accounts: [] });
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)));
  location = { href: '', pathname: '/dashboard' };
  Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true });
});

afterEach(() => vi.unstubAllGlobals());

describe('login', () => {
  it('deja la sesión iniciada con sus cuentas', () => {
    store().login(usuario, 'token-123', false, cuentas);
    expect(store().isAuthenticated).toBe(true);
    expect(store().user?.email).toBe('admin@ventrix.lat');
    expect(store().accounts).toHaveLength(2);
  });

  it('con "recordarme" guarda en localStorage (sobrevive cerrar el navegador)', () => {
    store().login(usuario, 'token-123', true);
    expect(localStorage.getItem('ventrix-remember')).toBe('true');
    expect(localStorage.getItem('ventrix-auth')).toBeTruthy();
    expect(sessionStorage.getItem('ventrix-auth')).toBeNull();
  });

  it('sin "recordarme" guarda en sessionStorage (se borra al cerrar la pestaña)', () => {
    store().login(usuario, 'token-123', false);
    expect(localStorage.getItem('ventrix-remember')).toBe('false');
    expect(sessionStorage.getItem('ventrix-auth')).toBeTruthy();
    expect(localStorage.getItem('ventrix-auth')).toBeNull();
  });

  it('NUNCA guarda el token de acceso en el disco', () => {
    // El token vive solo en memoria: si se persistiera, cualquier script de la
    // página podría leerlo desde localStorage.
    store().login(usuario, 'token-secreto', true);
    expect(store().accessToken).toBe('token-secreto');
    expect(JSON.stringify(guardado())).not.toContain('token-secreto');
    expect(guardado().state?.accessToken).toBeUndefined();
  });

  it('deja la marca que el middleware usa para redirigir', () => {
    store().login(usuario, 't', true);
    expect(document.cookie).toContain('logged_in=1');
  });

  it('deja las cuentas vacías si el backend no las manda', () => {
    store().login(usuario, 't', false);
    expect(store().accounts).toEqual([]);
  });
});

describe('restoreSession', () => {
  it('revive la sesión sin tocar la preferencia de "recordarme"', () => {
    localStorage.setItem('ventrix-remember', 'true');
    store().restoreSession(usuario, 'token-nuevo', cuentas);
    expect(store().isAuthenticated).toBe(true);
    expect(localStorage.getItem('ventrix-remember')).toBe('true');
  });

  it('conserva las cuentas que ya había si no le pasan ninguna', () => {
    store().login(usuario, 't', false, cuentas);
    store().restoreSession(usuario, 'otro-token');
    expect(store().accounts).toHaveLength(2);
  });
});

describe('expireSession — falló el refresh (red lenta, base fría)', () => {
  it('limpia el estado local', () => {
    store().login(usuario, 't', true, cuentas);
    store().expireSession();
    expect(store().isAuthenticated).toBe(false);
    expect(store().user).toBeNull();
    expect(store().accessToken).toBeNull();
  });

  it('NO borra "recordarme" ni llama al backend', () => {
    // Es la diferencia con logout: si el fallo fue pasajero, /login revive la
    // sesión con la cookie que sigue vigente en vez de quedar deslogueado.
    store().login(usuario, 't', true);
    store().expireSession();
    expect(localStorage.getItem('ventrix-remember')).toBe('true');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('manda a /login', () => {
    store().expireSession();
    expect(location.href).toBe('/login');
  });

  it('NO redirige si el usuario ya está en /login (evita el bucle)', () => {
    location.pathname = '/login';
    store().expireSession();
    expect(location.href).toBe('');
  });
});

describe('logout — el usuario sale a propósito', () => {
  it('borra "recordarme" y la marca del middleware', () => {
    store().login(usuario, 't', true, cuentas);
    store().logout();
    expect(store().isAuthenticated).toBe(false);
    expect(store().accounts).toEqual([]);
    expect(localStorage.getItem('ventrix-remember')).toBeNull();
    expect(document.cookie).not.toContain('logged_in=1');
  });

  it('avisa al backend para que borre la cookie de sesión', () => {
    store().login(usuario, 't', true);
    store().logout();
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('redirige a /login SOLO después de que el backend responde', async () => {
    // Si redirigiera antes, el middleware vería la cookie vieja y devolvería al
    // usuario al dashboard: bucle de redirección y pantalla en blanco.
    let responder: () => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((res) => {
      responder = () => res({ ok: true } as Response);
    })));

    store().login(usuario, 't', true);
    store().logout();
    expect(location.href).toBe('');

    responder();
    await vi.waitFor(() => expect(location.href).toBe('/login'));
  });
});

describe('multicuenta POS + Contable', () => {
  it('guarda las dos cuentas del mismo correo para el switcher', () => {
    store().setAccounts(cuentas);
    expect(store().accounts.map((c) => c.businessType)).toEqual(['pos', 'contable']);
  });

  it('tolera que llegue una lista nula', () => {
    store().setAccounts(null as never);
    expect(store().accounts).toEqual([]);
  });
});
