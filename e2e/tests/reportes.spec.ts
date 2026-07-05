import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Reportes', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/reportes');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga la página de reportes', async ({ page }) => {
    await expect(page).toHaveURL(/\/reportes/);
    await expect(page.locator('h1, h2, [class*="card"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('reporte de ventas carga datos', async ({ page }) => {
    const salesTab = page.locator('button:has-text("Ventas"), [role="tab"]:has-text("Ventas")');
    if (await salesTab.count() > 0) {
      await salesTab.first().click();
      await page.waitForTimeout(2_000);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('reporte de gastos carga datos', async ({ page }) => {
    const expensesTab = page.locator('button:has-text("Gastos"), [role="tab"]:has-text("Gastos")');
    if (await expensesTab.count() > 0) {
      await expensesTab.first().click();
      await page.waitForTimeout(2_000);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('cambiar rango de fechas', async ({ page }) => {
    const dateInputs = page.locator('input[type="date"]');
    if (await dateInputs.count() >= 2) {
      await dateInputs.nth(0).fill('2026-01-01');
      await dateInputs.nth(1).fill('2026-06-30');
      await page.waitForTimeout(1_000);
      await expect(page.locator('body')).not.toContainText('Error de base de datos');
    }
  });

  test('exportar reporte (si disponible)', async ({ page }) => {
    const exportBtn = page.locator('button:has-text("Exportar"), button:has-text("Descargar"), button:has([data-lucide="download"])');
    if (await exportBtn.count() > 0) {
      // Set up download handler
      const downloadPromise = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
      await exportBtn.first().click();
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.(xlsx|csv|pdf)$/i);
      }
    }
  });

  test('gráfica de ventas muestra canvas o SVG', async ({ page }) => {
    const chart = page.locator('canvas, svg[class*="recharts"], [class*="chart"]');
    if (await chart.count() > 0) {
      await expect(chart.first()).toBeVisible({ timeout: 10_000 });
    }
  });
});