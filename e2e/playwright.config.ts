import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // prod-verification corre contra PRODUCCIÓN (ventrix.lat) y hace login con una
  // cuenta real: no puede entrar en la corrida normal ni en el CI, que se
  // ejecutan contra el entorno local. Para ese se usa playwright-prod.config.ts.
  testIgnore: /prod-verification\.spec\.ts/,
  globalSetup: './global-setup.ts',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 2,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3001',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    locale: 'es-CO',
  },
  projects: [
    // Auth tests run WITHOUT storageState (they test the login flow itself)
    {
      name: 'auth-tests',
      testMatch: /auth\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // All other tests reuse the saved session — login is a fast JWT-cookie redirect
    {
      name: 'chromium',
      testMatch: /(?<!auth)\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: '.auth/user.json',
      },
    },
  ],
});