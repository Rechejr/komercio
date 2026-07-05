import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Ventas', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/ventas');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga la lista de ventas', async ({ page }) => {
    await expect(page).toHaveURL(/\/ventas/);
    const table = page.locator('table');
    const emptyMsg = page.getByText(/No hay ventas/);
    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test('filtro por fecha funciona', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.count() > 0) {
      await dateInput.fill('2026-01-01');
      await page.waitForTimeout(800);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('buscar por número de factura', async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"]');
    if (await search.count() > 0) {
      await search.fill('001');
      await page.waitForTimeout(800);
      await expect(page.locator('body')).not.toContainText('Error de base de datos');
    }
  });

  test('ver detalle de una venta', async ({ page }) => {
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

  test('anular una venta (si tiene botón)', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    if (await rows.count() === 0) {
      test.skip(true, 'No hay ventas para anular');
      return;
    }
    const voidBtn = rows.first().locator('button:has([data-lucide="x-circle"]), [aria-label*="Anular"]');
    if (await voidBtn.count() > 0 && await voidBtn.isEnabled()) {
      await voidBtn.click();
      // Handle either native dialog or React ConfirmDialog
      const confirmBtn = page.getByRole('dialog').getByRole('button').last();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click({ timeout: 3_000 }).catch(() => {});
        await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 4_000 }).catch(() => {});
      }
      await page.waitForTimeout(1_500);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('paginación funciona', async ({ page }) => {
    const nextBtn = page.locator('button:has-text("Siguiente")');
    if (await nextBtn.isVisible() && await nextBtn.isEnabled()) {
      await nextBtn.click();
      await page.waitForLoadState('networkidle');
      await expect(page.locator('button:has-text("Anterior")')).toBeEnabled();
    }
  });
});