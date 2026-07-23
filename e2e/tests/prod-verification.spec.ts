import { test, expect, Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { getTestEmail, getTestPassword, getBaseUrl } from '../helpers/credentials';

/**
 * Smoke test de verificación — SOLO LECTURA.
 *
 * Esta suite comprueba que la aplicación desplegada responde y que sus pantallas
 * principales cargan. Nada más.
 *
 * ── Por qué no crea, edita ni borra datos ────────────────────────────────────
 *
 * La versión anterior de este archivo se autenticaba contra ventrix.lat con
 * credenciales de administrador escritas en el código y ejecutaba operaciones de
 * escritura reales: registraba una venta (descontando stock verdadero), creaba
 * un gasto de $15.000 y daba de alta proveedores de prueba. Cada corrida dejaba
 * basura en la base de un negocio en producción y alteraba su inventario.
 *
 * Una prueba automatizada no puede distinguir "mi dato de prueba" de "el dato
 * del cliente". Por eso aquí solo se navega y se verifica que la interfaz
 * responda; cualquier prueba que necesite escribir debe correr contra el entorno
 * local o contra un negocio de pruebas dedicado (variable E2E_BASE_URL).
 */

const BASE = getBaseUrl();
const SHOTS = path.join(__dirname, '..', 'test-results', 'prod-shots');

async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"]').fill(getTestEmail());
  await page.locator('input[type="password"]').fill(getTestPassword());
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/dashboard|pos|configuracion|proveedores/, { timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
}

/** Una página se considera sana si responde y no muestra un error de la app. */
async function expectPageHealthy(page: Page, url: string, name: string) {
  const response = await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle' });

  if (response) {
    expect(response.status(), `${url} devolvió ${response.status()}`).toBeLessThan(400);
  }

  // No debe verse la pantalla de error global ni un 404 de la aplicación.
  const crashed = await page
    .locator('text=/Application error|Internal Server Error|Something went wrong/i')
    .first()
    .isVisible()
    .catch(() => false);
  expect(crashed, `${url} mostró una pantalla de error`).toBe(false);

  await shot(page, name);
}

test.describe('Verificación de despliegue (solo lectura)', () => {
  test('SMOKE-1: la página de login carga y permite autenticarse', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    await shot(page, 'smoke-1-login');

    // Tras autenticarse debe existir la navegación principal.
    await expect(page.locator('nav, aside, [role="navigation"]').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('SMOKE-2: las pantallas principales cargan sin error', async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);

    const paginas: Array<[string, string]> = [
      ['/dashboard', 'smoke-2a-dashboard'],
      ['/pos', 'smoke-2b-pos'],
      ['/inventario', 'smoke-2c-inventario'],
      ['/ventas', 'smoke-2d-ventas'],
      ['/clientes', 'smoke-2e-clientes'],
      ['/proveedores', 'smoke-2f-proveedores'],
      ['/gastos', 'smoke-2g-gastos'],
      ['/compras', 'smoke-2h-compras'],
    ];

    for (const [url, nombre] of paginas) {
      await expectPageHealthy(page, url, nombre);
    }
  });

  test('SMOKE-3: el POS muestra el catálogo de productos', async ({ page }) => {
    test.setTimeout(60_000);
    await login(page);
    await page.goto(`${BASE}/pos`, { waitUntil: 'networkidle' });

    // Solo se comprueba que el buscador exista y que la vista responda: no se
    // agrega nada al carrito ni se registra ninguna venta.
    const search = page
      .locator('input[placeholder*="buscar" i], input[placeholder*="Buscar" i]')
      .first();
    await expect(search).toBeVisible({ timeout: 20_000 });

    await shot(page, 'smoke-3-pos-catalogo');
  });

  test('SMOKE-4: el API responde en /health', async ({ request }) => {
    const apiBase = process.env.E2E_API_URL;
    test.skip(!apiBase, 'Define E2E_API_URL para verificar el API');

    const res = await request.get(`${apiBase}/health`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
  });
});
