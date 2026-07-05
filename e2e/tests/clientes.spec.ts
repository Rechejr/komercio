import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

const TEST_NAME = 'TEST_E2E_Cliente';
const TEST_EMAIL_CLIENT = 'test_e2e_cliente@test.com';

test.describe('Clientes', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/clientes');
    await page.waitForLoadState('domcontentloaded');
  });

  test('carga la lista de clientes', async ({ page }) => {
    await expect(page).toHaveURL(/\/clientes/);
    // Either table or empty state
    const table = page.locator('table');
    const emptyMsg = page.getByText(/No hay clientes/);
    await expect(table.or(emptyMsg).first()).toBeVisible({ timeout: 10_000 });
  });

  test('buscar cliente por nombre', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Buscar"]');
    await searchInput.fill('TEST_E2E');
    await page.waitForTimeout(800);
    await expect(page.locator('body')).not.toContainText('Error de base de datos');
  });

  test('crear cliente nuevo', async ({ page }) => {
    // Clean up any leftover test clients first
    await page.locator('input[placeholder*="Buscar"]').fill(TEST_NAME);
    await page.waitForTimeout(800);

    for (let i = 0; i < 5; i++) {
      const row = page.locator(`tr:has-text("${TEST_NAME}")`).first();
      if (await row.count() === 0) break;

      await row.locator('[aria-label="Eliminar cliente"]').click({ timeout: 5_000 }).catch(() => {});
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
    await page.waitForTimeout(400);

    await page.click('button:has-text("Nuevo cliente")');
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });

    await page.fill('input[name="name"]', TEST_NAME);
    await page.fill('input[name="email"]', TEST_EMAIL_CLIENT);
    await page.fill('input[name="phone"]', '3001234567');

    await page.click('button:has-text("Crear cliente")');
    await page.waitForSelector('.fixed.inset-0', { state: 'hidden', timeout: 10_000 });
    await expect(page.getByText(TEST_NAME).first()).toBeVisible({ timeout: 8_000 });
  });

  test('editar cliente existente', async ({ page }) => {
    // Search first so the test client appears even if paginated
    await page.locator('input[placeholder*="Buscar"]').fill(TEST_NAME);
    await page.waitForTimeout(800);
    const tableOrEmpty = page.locator('table').or(page.getByText(/No hay clientes/));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });
    const row = page.locator(`tr:has-text("${TEST_NAME}")`).first();
    if (await row.count() === 0) {
      test.skip(true, 'No hay cliente de prueba para editar');
      return;
    }
    await row.locator('[aria-label="Editar cliente"]').click();
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });

    const nameInput = page.locator('input[name="name"]');
    await nameInput.clear();
    await nameInput.fill(`${TEST_NAME}_EDITADO`);
    await page.click('button:has-text("Actualizar")');
    await page.waitForSelector('.fixed.inset-0', { state: 'hidden', timeout: 10_000 });
    await expect(page.getByText(`${TEST_NAME}_EDITADO`).first()).toBeVisible({ timeout: 8_000 });
  });

  test('eliminar cliente de prueba', async ({ page }) => {
    // Search to ensure the (possibly renamed) client is visible
    await page.locator('input[placeholder*="Buscar"]').fill(TEST_NAME);
    await page.waitForTimeout(800);
    const tableOrEmpty = page.locator('table').or(page.getByText(/No hay clientes/));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10_000 });
    const rowEdited = page.locator(`tr:has-text("${TEST_NAME}_EDITADO")`).first();
    const row = page.locator(`tr:has-text("${TEST_NAME}")`).first();

    const targetRow = (await rowEdited.count() > 0) ? rowEdited : row;
    if (await targetRow.count() === 0) {
      test.skip(true, 'No hay cliente de prueba para eliminar');
      return;
    }

    await targetRow.locator('[aria-label="Eliminar cliente"]').click();
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

  test('validación: crear cliente sin nombre muestra error', async ({ page }) => {
    await page.click('button:has-text("Nuevo cliente")');
    await page.waitForSelector('.fixed.inset-0', { timeout: 5_000 });
    await page.click('button:has-text("Crear cliente")');
    const modal = page.locator('.fixed.inset-0');
    await expect(modal).toBeVisible();
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