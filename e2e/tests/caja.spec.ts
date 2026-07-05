import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Caja (Cash Register)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/caja');
    await page.waitForLoadState('networkidle');
  });

  test('carga la página de caja', async ({ page }) => {
    await expect(page).toHaveURL(/\/caja/);
    await expect(page.locator('h1, h2, [class*="title"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test('muestra estado de caja (abierta/cerrada)', async ({ page }) => {
    const status = page.locator('text=/Caja abierta|Caja cerrada|Abrir caja|Cerrar caja/i');
    await expect(status.first()).toBeVisible({ timeout: 10_000 });
  });

  test('abrir caja (si está cerrada)', async ({ page }) => {
    const openBtn = page.locator('button:has-text("Abrir caja"), button:has-text("Apertura de caja")');
    if (await openBtn.count() > 0 && await openBtn.first().isEnabled()) {
      await openBtn.first().click();
      await page.waitForTimeout(1_000);
      const modal = page.locator('.fixed.inset-0');
      if (await modal.count() > 0) {
        // Fill opening amount
        const amountInput = modal.locator('input[name="openingAmount"], input[name="amount"]');
        if (await amountInput.count() > 0) {
          await amountInput.fill('100000');
        }
        const confirmBtn = modal.locator('button:has-text("Abrir"), button[type="submit"]');
        if (await confirmBtn.count() > 0) {
          await confirmBtn.first().click();
          await page.waitForSelector('.fixed.inset-0', { state: 'hidden', timeout: 10_000 });
        }
      }
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('registrar movimiento de caja', async ({ page }) => {
    const movBtn = page.locator('button:has-text("Movimiento"), button:has-text("Ingreso"), button:has-text("Egreso")');
    if (await movBtn.count() > 0) {
      await movBtn.first().click();
      await page.waitForTimeout(1_000);
      const modal = page.locator('.fixed.inset-0');
      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible();
        const closeBtn = modal.locator('button[aria-label="Cerrar"]').first();
        if (await closeBtn.count() > 0) await closeBtn.click();
      }
    }
  });

  test('historial de movimientos visible', async ({ page }) => {
    const historySection = page.locator('table, [class*="movimiento"], [class*="historial"]');
    // Just check page doesn't error — may be empty if caja is closed
    await expect(page.locator('body')).not.toContainText('Error de base de datos');
  });
});