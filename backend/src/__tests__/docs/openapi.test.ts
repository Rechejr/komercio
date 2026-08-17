import { generarSpec } from '../../../scripts/generateOpenapi';
import spec from '../../docs/openapi.json';

// Una documentación que se escribe aparte del código dura una semana. Estas
// pruebas hacen que el CI falle si alguien agrega o cambia una ruta y no corre
// `npm run docs:openapi`.

describe('openapi.json', () => {
  const generado = generarSpec().spec;

  it('está sincronizado con las rutas del código', () => {
    // Si esto falla: `npm run docs:openapi` y commitear el archivo.
    expect(JSON.parse(JSON.stringify(spec))).toEqual(JSON.parse(JSON.stringify(generado)));
  });

  it('documenta todos los endpoints', () => {
    const operaciones = Object.values(spec.paths).flatMap((m) => Object.keys(m));
    expect(operaciones.length).toBeGreaterThanOrEqual(179);
  });

  it('es un documento OpenAPI 3 válido en lo esencial', () => {
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBe('Ventrix API');
    expect(spec.servers.length).toBeGreaterThan(0);
    for (const [ruta, metodos] of Object.entries(spec.paths)) {
      expect(ruta.startsWith('/')).toBe(true);
      // Express usa :id, OpenAPI {id}: no debe quedar ningún ':' sin convertir.
      expect(ruta).not.toMatch(/:/);
      for (const [metodo, op] of Object.entries(metodos as Record<string, { summary?: string; responses?: object }>)) {
        expect(['get', 'post', 'put', 'patch', 'delete']).toContain(metodo);
        expect(op.summary).toBeTruthy();
        expect(op.responses).toBeTruthy();
      }
    }
  });

  it('todo parámetro de ruta está declarado', () => {
    for (const [ruta, metodos] of Object.entries(spec.paths)) {
      const enRuta = [...ruta.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      if (!enRuta.length) continue;
      for (const op of Object.values(metodos as Record<string, { parameters?: { name: string; in: string }[] }>)) {
        const declarados = (op.parameters || []).filter((p) => p.in === 'path').map((p) => p.name);
        expect(declarados.sort()).toEqual([...enRuta].sort());
      }
    }
  });

  it('mantiene la lista de endpoints públicos bajo control', () => {
    // Si esta lista crece, alguien expuso algo sin autenticación: hay que
    // revisar que sea a propósito antes de actualizar la prueba.
    const publicos = Object.entries(spec.paths)
      .flatMap(([ruta, metodos]) => Object.entries(metodos as Record<string, { security?: unknown[] }>)
        .filter(([, op]) => !op.security?.length)
        .map(([metodo]) => `${metodo.toUpperCase()} ${ruta}`))
      .sort();

    expect(publicos).toEqual([
      'GET /api/v1/auth/verify-email/{token}',
      'GET /api/v1/public/catalogo/{businessId}',
      'GET /api/v1/public/producto/{productId}',
      'GET /health',
      'GET /health/ready',
      'POST /api/v1/auth/forgot-password',
      'POST /api/v1/auth/google',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/logout',
      'POST /api/v1/auth/refresh-token',
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/resend-verification',
      'POST /api/v1/auth/reset-password',
      'POST /api/v1/payments/webhook',
      'POST /api/v1/seller/login',
    ]);
  });

  it('el portal de vendedoras usa su propia sesión, no la de usuarios', () => {
    const seller = Object.entries(spec.paths)
      .filter(([ruta]) => ruta.startsWith('/api/v1/seller') && !ruta.endsWith('/login'))
      .flatMap(([, metodos]) => Object.values(metodos as Record<string, { security?: Record<string, unknown>[] }>));

    expect(seller.length).toBeGreaterThan(0);
    for (const op of seller) expect(op.security?.[0]).toHaveProperty('sellerAuth');
  });

  it('las operaciones que exigen rol lo dejan explícito', () => {
    const conRol = Object.values(spec.paths)
      .flatMap((m) => Object.values(m as Record<string, { 'x-roles'?: string[]; responses?: Record<string, unknown> }>))
      .filter((op) => op['x-roles']);

    expect(conRol.length).toBeGreaterThan(0);
    for (const op of conRol) {
      expect(op.responses).toHaveProperty('403');
      for (const rol of op['x-roles']!) {
        expect(['SUPER_ADMIN', 'ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER', 'WAREHOUSE', 'AUXILIAR']).toContain(rol);
      }
    }
  });
});
