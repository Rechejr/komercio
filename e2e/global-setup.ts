import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { getTestEmail, getTestPassword } from './helpers/credentials';

export default async function globalSetup() {
  const authDir = path.join(__dirname, '.auth');
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://localhost:3001/login');
  await page.waitForLoadState('domcontentloaded');
  await page.locator('input[name="email"], input[type="email"]').first().fill(getTestEmail());
  await page.locator('input[name="password"], input[type="password"]').first().fill(getTestPassword());
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL('**/dashboard', { timeout: 40_000 });

  await context.storageState({ path: path.join(authDir, 'user.json') });
  await browser.close();
}