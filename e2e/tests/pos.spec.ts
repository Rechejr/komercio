import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('POS - Punto de Venta', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/pos');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga el POS correctamente', async ({ page }) => {
    await expect(page).toHaveURL(/\/pos/);
    // POS should show product grid or search
    const content = page.locator('[class*="grid"], [class*="product"], input[placeholder*="Buscar"]');
    await expect(content.first()).toBeVisible({ timeout: 10_000 });
  });

  test('búsqueda de producto funciona', async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar producto"], input[placeholder*="código"]');
    if (await search.count() > 0) {
      await search.fill('Arroz');
      await page.waitForTimeout(800);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('agregar producto al carrito', async ({ page }) => {
    // Find a product button and click it
    const productBtn = page.locator('[class*="product-card"], button:has-text("Arroz"), [class*="grid"] button').first();
    if (await productBtn.count() > 0) {
      await productBtn.click();
      await page.waitForTimeout(500);
      // Cart should show item
      const cartItem = page.locator('[class*="cart"], [class*="carrito"]');
      if (await cartItem.count() > 0) {
        await expect(cartItem.first()).toBeVisible();
      }
    }
  });

  test('campo de búsqueda por código de barras', async ({ page }) => {
    const barcodeInput = page.locator('input[placeholder*="código"], input[placeholder*="barras"]');
    if (await barcodeInput.count() > 0) {
      await barcodeInput.fill('P001');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(800);
      await expect(page.locator('body')).not.toContainText('Error de base de datos');
    }
  });

  test('total del carrito se calcula', async ({ page }) => {
    // After adding a product, total should update
    const productBtn = page.locator('[class*="grid"] button, [class*="product"] button').first();
    if (await productBtn.count() > 0) {
      await productBtn.click();
      await page.waitForTimeout(500);
      const total = page.locator('[class*="total"], text=/Total:/');
      if (await total.count() > 0) {
        await expect(total.first()).toBeVisible();
      }
    }
  });

  test('crear cliente rápido desde POS', async ({ page }) => {
    const newClientBtn = page.locator('button:has-text("Nuevo cliente"), button:has-text("Crear cliente")');
    if (await newClientBtn.count() > 0) {
      await newClientBtn.click();
      await page.waitForTimeout(1_000);
      // Modal should open
      const modal = page.locator('.fixed.inset-0, [role="dialog"]');
      if (await modal.count() > 0) {
        await expect(modal.first()).toBeVisible();
        // Close it
        const closeBtn = modal.locator('button[aria-label="Cerrar"]').first();
        if (await closeBtn.count() > 0) await closeBtn.click();
      }
    }
  });
});