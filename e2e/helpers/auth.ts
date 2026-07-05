import { Page } from '@playwright/test';

export const TEST_EMAIL = 'admin@komercio.app';
export const TEST_PASSWORD = 'Admin123!';

export async function login(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');

  // With storageState, the server redirects to /dashboard via JWT cookie.
  // Allow up to 15s for the redirect — Neon DB cold starts can take several seconds.
  const quickRedirect = await page.waitForURL('**/dashboard', { timeout: 15_000 }).then(() => true).catch(() => false);
  if (quickRedirect) return;

  // Fall back to filling the form (fresh context or expired cookie)
  const emailInput = page.locator('input[name="email"], input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  await emailInput.fill(TEST_EMAIL);
  await page.locator('input[name="password"], input[type="password"]').first().fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').first().click();

  try {
    await page.waitForURL('**/dashboard', { timeout: 40_000 });
  } catch {
    const url = page.url();
    if (url.includes('/login')) {
      const errMsg = await page.locator('[role="alert"], .text-red-500, [data-hot-toast]').first().textContent().catch(() => 'Sin mensaje');
      throw new Error(`Login falló, aún en /login. Error visible: ${errMsg}`);
    }
    await page.waitForURL('**/(dashboard|home|pos)', { timeout: 5_000 }).catch(() => {});
  }
}

export async function navigateTo(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}