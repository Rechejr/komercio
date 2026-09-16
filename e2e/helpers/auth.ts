import { Page } from '@playwright/test';

export const TEST_EMAIL = 'admin@komercio.app';
export const TEST_PASSWORD = 'Admin123!';

/**
 * Inicia sesión. Con storageState el servidor revive la sesión solo y redirige
 * a /dashboard; si no, se llena el formulario.
 *
 * Si falla, el error dice QUÉ respondió el servidor a cada petición de sesión y
 * en cuánto tiempo. Antes solo decía "aún en /login. Error visible: " (vacío),
 * y con eso no se podía saber si el servidor respondió mal, respondió tarde o
 * no respondió: el nocturno del CI falló así tres veces seguidas en el mismo
 * spec y nos quedamos adivinando.
 */
export async function login(page: Page) {
  // Bitácora de lo que el servidor respondió mientras se intentaba entrar.
  const bitacora: string[] = [];
  const inicio = Date.now();
  const anotar = (linea: string) => bitacora.push(`+${((Date.now() - inicio) / 1000).toFixed(1)}s ${linea}`);
  const onResponse = (r: import('@playwright/test').Response) => {
    const url = r.url();
    if (/\/auth\/(login|refresh-token|me)/.test(url)) anotar(`${r.request().method()} ${url.replace(/^.*\/api\/v1/, '')} → ${r.status()}`);
  };
  const onFailed = (req: import('@playwright/test').Request) => {
    if (/\/auth\//.test(req.url())) anotar(`${req.method()} ${req.url().replace(/^.*\/api\/v1/, '')} → SIN RESPUESTA (${req.failure()?.errorText ?? 'desconocido'})`);
  };
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);

  try {
    await page.goto('/login');
    await page.waitForLoadState('domcontentloaded');

    // With storageState, the server redirects to /dashboard via JWT cookie.
    // Allow up to 15s for the redirect — Neon DB cold starts can take several seconds.
    const quickRedirect = await page.waitForURL('**/dashboard', { timeout: 15_000 }).then(() => true).catch(() => false);
    if (quickRedirect) return;
    anotar('la cookie no revivió la sesión en 15s; se llena el formulario');

    // Fall back to filling the form (fresh context or expired cookie)
    const emailInput = page.locator('input[name="email"], input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
    await emailInput.fill(TEST_EMAIL);
    await page.locator('input[name="password"], input[type="password"]').first().fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    anotar('formulario enviado');

    try {
      await page.waitForURL('**/dashboard', { timeout: 40_000 });
    } catch {
      const url = page.url();
      if (url.includes('/login')) {
        const errMsg = await page.locator('[role="alert"], .text-red-500, [data-hot-toast]').first().textContent().catch(() => 'Sin mensaje');
        throw new Error(
          `Login falló, aún en /login. Error visible: ${errMsg || '(ninguno)'}\n` +
          `Lo que respondió el servidor:\n  ${bitacora.length ? bitacora.join('\n  ') : '(ninguna petición de sesión llegó a responder)'}`,
        );
      }
      await page.waitForURL('**/(dashboard|home|pos)', { timeout: 5_000 }).catch(() => {});
    }
  } finally {
    page.off('response', onResponse);
    page.off('requestfailed', onFailed);
  }
}

export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}
