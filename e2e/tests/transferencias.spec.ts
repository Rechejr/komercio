import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Transferencias entre bodegas', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/transferencias');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga la página de transferencias', async ({ page }) => {
    await expect(page).toHaveURL(/\/transferencias/);
    const table = page.locator('table');
    const emptyMsg = page.getByText(/No hay transferencias/);
    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test('abrir formulario de nueva transferencia (si hay 2+ bodegas)', async ({ page }) => {
    const newBtn = page.locator('button:has-text("Nueva transferencia")');
    await expect(newBtn.first()).toBeVisible({ timeout: 8_000 });

    // Con solo 1 bodega el botón queda deshabilitado y se muestra un aviso —
    // ambos son comportamientos válidos según cuántas bodegas tenga la cuenta de prueba.
    const isEnabled = await newBtn.first().isEnabled();
    if (!isEnabled) {
      await expect(page.getByText(/al menos 2 bodegas/i)).toBeVisible();
      return;
    }

    await newBtn.first().click();
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });
    await expect(page.getByText('Bodega de origen')).toBeVisible();
    await expect(page.getByText('Bodega de destino')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('ver detalle de una transferencia existente (si hay alguna)', async ({ page }) => {
    const rows = page.locator('table tbody tr');
    if (await rows.count() > 0 && await rows.first().locator('td').count() > 1) {
      await rows.first().click();
      await page.waitForTimeout(800);
      const modal = page.locator('.fixed.inset-0');
      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
  });
});
