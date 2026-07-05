import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

const TEST_PRODUCT = 'TEST_E2E_Producto';
// Unique code per run avoids duplicate-code constraint errors from previous runs
const TEST_CODE = `E2E_${Date.now().toString().slice(-8)}`;

test.describe('Inventario', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/inventario');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga la lista de productos', async ({ page }) => {
    await expect(page).toHaveURL(/\/inventario/);
    const table = page.locator('table');
    const emptyMsg = page.getByText(/No hay productos/);
    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test('filtro por búsqueda funciona', async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"]');
    await search.fill('TEST_E2E');
    await page.waitForTimeout(800);
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('crear producto nuevo', async ({ page }) => {
    // Clean up any leftover test products (includes _EDITADO variant)
    for (const searchTerm of [TEST_PRODUCT + '_EDITADO', TEST_PRODUCT]) {
      await page.locator('input[placeholder*="Buscar"]').fill(searchTerm);
      await page.waitForTimeout(800);
      for (let i = 0; i < 5; i++) {
        const row = page.locator(`tr:has-text("${searchTerm}")`).first();
        if (await row.count() === 0) break;
        await row.locator('[aria-label*="Eliminar"]').click({ timeout: 5_000 }).catch(() => {});
        const confirmBtn = page.getByRole('dialog').getByRole('button').last();
        if (await confirmBtn.count() > 0) {
          await confirmBtn.click({ timeout: 3_000 }).catch(() => {});
          await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 4_000 }).catch(() => {});
        } else {
          await page.keyboard.press('Escape').catch(() => {});
        }
        await page.waitForTimeout(500);
      }
    }

    await page.locator('input[placeholder*="Buscar"]').clear();
    await page.waitForTimeout(300);
    // Close any lingering modal before opening a new one
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);

    const newBtn = page.locator('button:has-text("Nuevo producto"), button:has-text("Agregar producto")');
    await newBtn.first().click();
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });

    await page.fill('input[name="name"]', TEST_PRODUCT);
    const codeInput = page.locator('input[name="code"]');
    if (await codeInput.count() > 0) await codeInput.fill(TEST_CODE);

    // PriceInput renders type="text" with inputMode="numeric"; triple-click to select all, then type
    const salePriceInput = page.locator('input[name="salePrice"]');
    await salePriceInput.click({ clickCount: 3 });
    await salePriceInput.pressSequentially('5000');

    const costInput = page.locator('input[name="costPrice"]');
    if (await costInput.count() > 0) {
      await costInput.click({ clickCount: 3 });
      await costInput.pressSequentially('3000');
    }

    const stockInput = page.locator('input[name="stock"]');
    if (await stockInput.count() > 0) await stockInput.fill('10');

    // Button text is "Crear producto" when creating
    await page.locator('button[type="submit"]').first().click();
    await page.waitForSelector('.fixed.inset-0', { state: 'hidden', timeout: 15_000 });
    await expect(page.getByText(TEST_PRODUCT).first()).toBeVisible({ timeout: 8_000 });
  });

  test('editar producto', async ({ page }) => {
    // Search first so the test product appears even if paginated
    await page.locator('input[placeholder*="Buscar"]').fill(TEST_PRODUCT);
    await page.waitForTimeout(800);
    const tableOrEmpty = page.locator('table').or(page.getByText(/No hay productos/));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });
    const row = page.locator(`tr:has-text("${TEST_PRODUCT}")`).first();
    if (await row.count() === 0) {
      test.skip(true, 'No hay producto de prueba');
      return;
    }
    await row.locator('[aria-label*="Editar"]').click();
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });

    const nameInput = page.locator('input[name="name"]');
    await nameInput.clear();
    await nameInput.fill(`${TEST_PRODUCT}_EDITADO`);

    await page.locator('button[type="submit"]:has-text("Actualizar"), button:has-text("Guardar")').first().click();
    await page.waitForSelector('.fixed.inset-0', { state: 'hidden', timeout: 10_000 });
    await expect(page.getByText(`${TEST_PRODUCT}_EDITADO`).first()).toBeVisible({ timeout: 8_000 });
  });

  test('eliminar producto de prueba', async ({ page }) => {
    const search = page.locator('input[placeholder*="Buscar"]');
    await search.fill(TEST_PRODUCT);
    await page.waitForTimeout(800);

    const rowEdited = page.locator(`tr:has-text("${TEST_PRODUCT}_EDITADO")`).first();
    const row = page.locator(`tr:has-text("${TEST_PRODUCT}")`).first();
    const targetRow = (await rowEdited.count() > 0) ? rowEdited : row;

    if (await targetRow.count() === 0) {
      test.skip(true, 'No hay producto de prueba para eliminar');
      return;
    }

    await targetRow.locator('[aria-label*="Eliminar"]').click();
    // Confirm via ConfirmDialog (React/Radix modal)
    const confirmBtn = page.getByRole('dialog').getByRole('button').last();
    if (await confirmBtn.count() > 0) {
      await confirmBtn.click({ timeout: 3_000 }).catch(() => {});
      await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
    await page.waitForTimeout(1_000);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`tr:has-text("${TEST_PRODUCT}_EDITADO")`).first()).not.toBeVisible({ timeout: 5_000 });
  });

  test('filtro por categoría funciona', async ({ page }) => {
    const categoryFilter = page.locator('select').first();
    if (await categoryFilter.count() > 0 && await categoryFilter.isVisible()) {
      await categoryFilter.selectOption({ index: 1 });
      await page.waitForTimeout(500);
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