import { test as setup } from '@playwright/test';
import path from 'path';

export const STORAGE_STATE = path.join(__dirname, '../.auth/user.json');

setup('autenticar usuario admin', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('input[name="email"], input[type="email"]').first().fill('admin@komercio.app');
  await page.locator('input[name="password"], input[type="password"]').first().fill('Admin123!');
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/dashboard', { timeout: 40_000 });
  await page.context().storageState({ path: STORAGE_STATE });
});