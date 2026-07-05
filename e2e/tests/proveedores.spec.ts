import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

const TEST_NAME = 'TEST_E2E_Proveedor';

test.describe('Proveedores', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/proveedores');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga la lista de proveedores', async ({ page }) => {
    await expect(page).toHaveURL(/\/proveedores/);
    const table = page.locator('table');
    const emptyMsg = page.getByText(/No hay proveedores/);
    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test('buscar proveedor', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await searchInput.fill('TEST_E2E');
    await page.waitForTimeout(800);
    await expect(page.locator('body')).not.toContainText('Error de base de datos');
  });

  test('crear proveedor nuevo', async ({ page }) => {
    // Clean up first
    await page.locator('input[placeholder*="Buscar"]').fill(TEST_NAME);
    await page.waitForTimeout(800);

    for (let i = 0; i < 5; i++) {
      const row = page.locator(`tr:has-text("${TEST_NAME}")`).first();
      if (await row.count() === 0) break;

      await row.locator('[aria-label*="Eliminar"]').click({ timeout: 5_000 }).catch(() => {});
      // ConfirmDialog is a React/Radix modal — not a native browser dialog
      const confirmBtn = page.getByRole('dialog').getByRole('button').last();
      if (await confirmBtn.count() > 0) {
        await confirmBtn.click({ timeout: 3_000 }).catch(() => {});
        await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 4_000 }).catch(() => {});
      } else {
        await page.keyboard.press('Escape').catch(() => {});
      }
      await page.waitForTimeout(500);
    }

    await page.locator('input[placeholder*="Buscar"]').clear();
    await page.waitForTimeout(300);
    // Close any lingering modal before opening a new one
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(200);

    await page.click('button:has-text("Nuevo proveedor")');
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });

    await page.fill('input[name="name"]', TEST_NAME);
    await page.fill('input[name="phone"]', '6014567890');
    await page.fill('input[name="mobile"]', '3101234567');

    await page.click('button:has-text("Crear proveedor")');
    await page.waitForSelector('.fixed.inset-0', { state: 'hidden', timeout: 10_000 });
    await expect(page.getByText(TEST_NAME).first()).toBeVisible({ timeout: 8_000 });
  });

  test('editar proveedor', async ({ page }) => {
    const tableOrEmpty = page.locator('table').or(page.getByText(/No hay proveedores/));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });
    const row = page.locator(`tr:has-text("${TEST_NAME}")`).first();
    if (await row.count() === 0) {
      test.skip(true, 'No hay proveedor de prueba');
      return;
    }
    await row.locator('[aria-label*="Editar"]').click();
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });

    const nameInput = page.locator('input[name="name"]');
    await nameInput.clear();
    await nameInput.fill(`${TEST_NAME}_EDITADO`);
    await page.click('button:has-text("Actualizar")');
    await page.waitForSelector('.fixed.inset-0', { state: 'hidden', timeout: 10_000 });
    await expect(page.getByText(`${TEST_NAME}_EDITADO`).first()).toBeVisible({ timeout: 8_000 });
  });

  test('eliminar proveedor de prueba', async ({ page }) => {
    // Search to ensure the (possibly renamed) proveedor is visible
    await page.locator('input[placeholder*="Buscar"]').fill(TEST_NAME);
    await page.waitForTimeout(800);
    const tableOrEmpty = page.locator('table').or(page.getByText(/No hay proveedores/));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });
    const rowEdited = page.locator(`tr:has-text("${TEST_NAME}_EDITADO")`).first();
    const row = page.locator(`tr:has-text("${TEST_NAME}")`).first();
    const targetRow = (await rowEdited.count() > 0) ? rowEdited : row;
    if (await targetRow.count() === 0) {
      test.skip(true, 'No hay proveedor de prueba para eliminar');
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
    await expect(page.locator(`tr:has-text("${TEST_NAME}_EDITADO")`).first()).not.toBeVisible({ timeout: 5_000 });
  });

  test('campo teléfono tiene límite de 10 dígitos', async ({ page }) => {
    await page.click('button:has-text("Nuevo proveedor")');
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });
    const phoneInput = page.locator('input[name="phone"]');
    await phoneInput.fill('12345678901'); // 11 digits
    const value = await phoneInput.inputValue();
    expect(value.length).toBeLessThanOrEqual(10);
    await page.keyboard.press('Escape');
  });
});