import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Configuración', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/configuracion');
    await page.waitForLoadState('networkidle');
  });

  test('carga la página de configuración', async ({ page }) => {
    await expect(page).toHaveURL(/\/configuracion/);
    const content = page.locator('form, [class*="card"]').first();
    await expect(content).toBeVisible({ timeout: 10_000 });
  });

  test('mostrar datos del negocio', async ({ page }) => {
    const businessNameInput = page.locator('input[name="name"]').first();
    await expect(businessNameInput).toBeVisible({ timeout: 8_000 });
  });

  test('guardar configuración sin cambios no da error', async ({ page }) => {
    const saveBtn = page.locator('button:has-text("Guardar"), button[type="submit"]').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(2_000);
      await expect(page.locator('body')).not.toContainText('Error de base de datos');
    }
  });

  test('sección de usuarios (si disponible)', async ({ page }) => {
    const usersTab = page.locator('button:has-text("Usuarios"), [role="tab"]:has-text("Usuarios")');
    if (await usersTab.count() > 0) {
      await usersTab.first().click();
      await page.waitForTimeout(1_000);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('sección de sucursales (si disponible)', async ({ page }) => {
    const branchTab = page.locator('button:has-text("Sucursales"), [role="tab"]:has-text("Sucursal")');
    if (await branchTab.count() > 0) {
      await branchTab.first().click();
      await page.waitForTimeout(1_000);
      await expect(page.locator('body')).not.toContainText('Error');
    }
  });

  test('campo teléfono del negocio tiene límite de 10 dígitos', async ({ page }) => {
    const phoneInput = page.locator('input[name="phone"]').first();
    if (await phoneInput.count() > 0) {
      await phoneInput.fill('12345678901'); // 11 digits
      const value = await phoneInput.inputValue();
      expect(value.length).toBeLessThanOrEqual(10);
    }
  });

  test('cambio de moneda funciona (si disponible)', async ({ page }) => {
    const currencySelect = page.locator('select[name="currency"]');
    if (await currencySelect.count() > 0) {
      await currencySelect.selectOption('USD');
      await page.waitForTimeout(300);
      await expect(currencySelect).toHaveValue('USD');
    }
  });
});