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

  test('cargar inventario — escribir cantidad y guardar', async ({ page }) => {
    const loadBtn = page.locator('button:has-text("Cargar inventario")');
    await expect(loadBtn.first()).toBeVisible({ timeout: 8_000 });
    await loadBtn.first().click();
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });

    const branchSelect = page.locator('select').first();
    await branchSelect.selectOption({ index: 1 });

    const productRow = page.locator('.fixed.inset-0 input[type="number"]').first();
    await expect(productRow).toBeVisible({ timeout: 8_000 });
    await productRow.fill('7');

    await page.locator('button:has-text("Guardar conteo")').click();
    await expect(page.getByText(/actualizado/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Algo salió mal')).not.toBeVisible();
  });

  test('cargar inventario — abrir "Nuevo producto" rápido', async ({ page }) => {
    const loadBtn = page.locator('button:has-text("Cargar inventario")');
    await loadBtn.first().click();
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });

    const branchSelect = page.locator('select').first();
    await branchSelect.selectOption({ index: 1 });

    const newProductBtn = page.locator('button:has-text("Nuevo producto")');
    await expect(newProductBtn.first()).toBeVisible({ timeout: 8_000 });
    await newProductBtn.first().click();
    await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press('Escape');
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
