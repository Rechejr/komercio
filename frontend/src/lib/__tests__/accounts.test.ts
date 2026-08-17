import { describe, it, expect, beforeEach, vi } from 'vitest';
import { homeForBusinessType, switchToAccount, activarProducto } from '../accounts';
import { api } from '../api';
import { useAuthStore } from '@/store/auth.store';

vi.mock('../api', () => ({ api: { post: vi.fn(), get: vi.fn() } }));

const usuarioPos = { id: 'u1', name: 'Cristian', email: 'a@b.com', role: 'ADMIN', businessId: 'b1', businessType: 'pos' };
const usuarioContable = { ...usuarioPos, businessId: 'b2', businessType: 'contable' };

let location: { href: string };

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false, accounts: [] });
  location = { href: '' };
  Object.defineProperty(window, 'location', { value: location, writable: true, configurable: true });
});

describe('homeForBusinessType', () => {
  it('manda cada producto a su propio tablero', () => {
    expect(homeForBusinessType('contable')).toBe('/contable/panel');
    expect(homeForBusinessType('pos')).toBe('/dashboard');
  });

  it('sin tipo definido cae en el POS', () => {
    expect(homeForBusinessType(undefined)).toBe('/dashboard');
    expect(homeForBusinessType('')).toBe('/dashboard');
  });
});

describe('switchToAccount — cambiar de cuenta con el mismo correo', () => {
  it('pide un token nuevo para el negocio elegido', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { user: usuarioContable, accessToken: 'tk-2', accounts: [] } } } as never);
    await switchToAccount('b2');
    expect(api.post).toHaveBeenCalledWith('/auth/switch-business', { businessId: 'b2' });
  });

  it('deja en el store el usuario y el token del OTRO negocio', async () => {
    // Todo es multi-tenant: si el token no se reemplaza, se seguirían viendo los
    // datos del negocio anterior.
    vi.mocked(api.post).mockResolvedValue({
      data: { data: { user: usuarioContable, accessToken: 'tk-2', accounts: [{ businessId: 'b2', businessType: 'contable' }] } },
    } as never);

    await switchToAccount('b2');

    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('tk-2');
    expect(s.user?.businessId).toBe('b2');
    expect(s.accounts).toHaveLength(1);
  });

  it('recarga la página completa en el tablero del producto destino', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { user: usuarioContable, accessToken: 'tk-2' } } } as never);
    await switchToAccount('b2');
    expect(location.href).toBe('/contable/panel');
  });

  it('al volver al POS aterriza en su tablero', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { user: usuarioPos, accessToken: 'tk-1' } } } as never);
    await switchToAccount('b1');
    expect(location.href).toBe('/dashboard');
  });

  it('no navega si el cambio falla', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('403'));
    await expect(switchToAccount('ajeno')).rejects.toThrow();
    expect(location.href).toBe('');
  });
});

describe('activarProducto — activar el segundo producto sin otro correo', () => {
  it('crea el producto y devuelve sus datos', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { businessId: 'b9', businessType: 'contable', businessName: 'Mi Contable' } } } as never);
    vi.mocked(api.get).mockResolvedValue({ data: { data: { accounts: [] } } } as never);

    const creado = await activarProducto('Mi Contable', 'contable');

    expect(api.post).toHaveBeenCalledWith('/auth/activar-producto', { businessName: 'Mi Contable', businessType: 'contable' });
    expect(creado.businessId).toBe('b9');
  });

  it('refresca las cuentas para que el switcher lo muestre de una vez', async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { data: { businessId: 'b9' } } } as never);
    vi.mocked(api.get).mockResolvedValue({
      data: { data: { accounts: [{ businessId: 'b1', businessType: 'pos' }, { businessId: 'b9', businessType: 'contable' }] } },
    } as never);

    await activarProducto('Mi Contable', 'contable');

    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(useAuthStore.getState().accounts).toHaveLength(2);
  });

  it('si /me falla, el producto igual queda activado', async () => {
    // No es crítico: el switcher se actualiza en el próximo login.
    vi.mocked(api.post).mockResolvedValue({ data: { data: { businessId: 'b9' } } } as never);
    vi.mocked(api.get).mockRejectedValue(new Error('timeout'));

    await expect(activarProducto('Mi Contable', 'contable')).resolves.toMatchObject({ businessId: 'b9' });
  });
});
