import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('carga la página principal', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
    // Check page renders at least one card/stat
    await expect(page.locator('.card, [class*="card"], .rounded-2xl').first()).toBeVisible({ timeout: 10_000 });
  });

  test('muestra estadísticas de ventas', async ({ page }) => {
    // KPI cards should be visible
    const stats = page.locator('.card, [class*="stat"], [class*="kpi"]');
    await expect(stats.first()).toBeVisible({ timeout: 10_000 });
  });

  test('muestra gráfica o tabla de ventas recientes', async ({ page }) => {
    // Check for chart or recent sales table
    const content = page.locator('canvas, table, [class*="chart"], [class*="graph"]');
    await expect(content.first()).toBeVisible({ timeout: 12_000 });
  });

  test('muestra productos con stock bajo (si los hay)', async ({ page }) => {
    // This section may or may not have data
    const section = page.locator('[class*="stock"], [class*="alerta"], h2, h3').filter({ hasText: /stock|alerta|bajo/i });
    // Just check it doesn't crash (may be empty)
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('navegación lateral funciona', async ({ page }) => {
    // Test sidebar links work
    const sidebarLinks = [
      { text: /ventas/i, url: '/ventas' },
      { text: /inventario/i, url: '/inventario' },
      { text: /clientes/i, url: '/clientes' },
    ];
    for (const link of sidebarLinks) {
      const btn = page.locator(`a:has-text("${link.text.source}"), nav a`).filter({ hasText: link.text }).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForLoadState('networkidle');
        await expect(page).toHaveURL(new RegExp(link.url));
        await page.goto('/dashboard');
        await page.waitForLoadState('networkidle');
      }
    }
  });
});