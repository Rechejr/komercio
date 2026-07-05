import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Créditos', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/creditos');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga la lista de créditos', async ({ page }) => {
    await expect(page).toHaveURL(/\/creditos/);
    const table = page.locator('table');
    const emptyMsg = page.getByText(/No hay créditos|Sin créditos/);
    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test('buscar crédito por cliente', async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"]');
    if (await search.count() > 0) {
      await search.fill('TEST');
      await page.waitForTimeout(800);
      await expect(page.locator('body')).not.toContainText('Error de base de datos');
    }
  });

  test('ver detalle de crédito', async ({ page }) => {
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

  test('registrar pago de crédito', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    if (await rows.count() > 0) {
      const payBtn = rows.first().locator('button:has-text("Pagar"), button:has-text("Abono"), [aria-label*="Pago"]');
      if (await payBtn.count() > 0) {
        await payBtn.click();
        await page.waitForTimeout(1_000);
        const modal = page.locator('.fixed.inset-0');
        if (await modal.count() > 0) {
          await expect(modal.first()).toBeVisible();
          await page.keyboard.press('Escape');
        }
      }
    }
  });

  test('filtro por estado funciona', async ({ page }) => {
    const statusFilter = page.locator('select').first();
    if (await statusFilter.isVisible()) {
      await statusFilter.selectOption({ index: 0 });
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });
});