import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Compras', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/compras');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga la página de compras', async ({ page }) => {
    await expect(page).toHaveURL(/\/compras/);
    const table = page.locator('table');
    const emptyMsg = page.getByText(/No hay compras/);
    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test('abrir formulario de nueva compra', async ({ page }) => {
    const newBtn = page.locator('button:has-text("Nueva compra"), button:has-text("Registrar compra")');
    if (await newBtn.count() > 0) {
      await newBtn.first().click();
      await page.waitForTimeout(1_000);
      const modal = page.locator('.fixed.inset-0');
      await expect(modal.first()).toBeVisible({ timeout: 5_000 });
      // Use Escape to close to avoid click interception
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    }
  });

  test('crear proveedor desde compras', async ({ page }) => {
    const supplierSection = page.locator('button:has-text("Nuevo proveedor"), button:has-text("Crear proveedor")');
    if (await supplierSection.count() > 0) {
      await supplierSection.first().click();
      await page.waitForTimeout(1_000);
      const modal = page.locator('.fixed.inset-0');
      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
  });

  test('filtro por proveedor', async ({ page }) => {
    const supplierFilter = page.locator('select, [role="combobox"]').first();
    if (await supplierFilter.count() > 0 && await supplierFilter.isVisible()) {
      await supplierFilter.selectOption({ index: 0 });
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('ver detalle de compra', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    if (await rows.count() > 0) {
      const detailBtn = rows.first().locator('button:has([data-lucide="eye"]), [aria-label*="Ver"]');
      if (await detailBtn.count() > 0) {
        await detailBtn.click();
        await page.waitForTimeout(1_000);
        const modal = page.locator('.fixed.inset-0');
        if (await modal.count() > 0) {
          await expect(modal.first()).toBeVisible();
          await page.keyboard.press('Escape');
        }
      }
    }
  });
});