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
    // Las pruebas corren en horario de Colombia, como los negocios que usan el
    // sistema. Sin esto el navegador hereda la zona de la máquina —aquí
    // Colombia, en el runner de GitHub UTC—, y una prueba que depende de "hoy"
    // podía pasar local y fallar allá sin que el código tuviera nada malo.
    // TZ_E2E deja reproducir a propósito la zona del CI (TZ_E2E=UTC).
    timezoneId: process.env.TZ_E2E || 'America/Bogota',
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