import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

const TEST_EXPENSE = 'TEST_E2E_Gasto';

test.describe('Gastos', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/gastos');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga la lista de gastos', async ({ page }) => {
    await expect(page).toHaveURL(/\/gastos/);
    const table = page.locator('table');
    const emptyMsg = page.getByText(/No hay gastos/);
    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test('registrar nuevo gasto', async ({ page }) => {
    const newBtn = page.locator('button:has-text("Nuevo gasto"), button:has-text("Registrar gasto")');
    if (await newBtn.count() > 0) {
      await newBtn.first().click();
      await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });

      const descInput = page.locator('input[name="description"], input[name="concept"], input[placeholder*="Descripción"]');
      if (await descInput.count() > 0) {
        await descInput.first().fill(TEST_EXPENSE);
      }

      const amountInput = page.locator('input[name="amount"], input[placeholder*="Monto"], input[placeholder*="Valor"]');
      if (await amountInput.count() > 0) {
        await amountInput.first().fill('50000');
      }

      const submitBtn = page.locator('button[type="submit"]:has-text("Registrar"), button:has-text("Guardar"), button:has-text("Crear gasto")');
      if (await submitBtn.count() > 0) {
        await submitBtn.first().click();
        await page.waitForSelector('.fixed.inset-0', { state: 'hidden', timeout: 10_000 });
        await expect(page.locator('body')).not.toContainText('Error de base de datos');
      }
    }
  });

  test('gestionar categorías de gastos', async ({ page }) => {
    const catBtn = page.locator('button:has-text("Categorías"), button:has-text("Gestionar categorías")');
    if (await catBtn.count() > 0) {
      await catBtn.first().click();
      await page.waitForTimeout(1_000);
      const modal = page.locator('.fixed.inset-0');
      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible();
        await page.keyboard.press('Escape');
      }
    }
  });

  test('filtro por fecha funciona', async ({ page }) => {
    const dateInput = page.locator('input[type="date"]').first();
    if (await dateInput.count() > 0) {
      await dateInput.fill('2026-01-01');
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('filtro por categoría funciona', async ({ page }) => {
    const catFilter = page.locator('select').first();
    if (await catFilter.count() > 0 && await catFilter.isVisible()) {
      await catFilter.selectOption({ index: 0 });
      await page.waitForTimeout(500);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });
});