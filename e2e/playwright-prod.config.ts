import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'https://ventrix.lat',
    screenshot: 'on',
    locale: 'es-CO',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'prod',
      testMatch: /prod-verification\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});