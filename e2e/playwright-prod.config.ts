import { defineConfig, devices } from '@playwright/test';
import { getBaseUrl } from './helpers/credentials';

/**
 * Configuración para verificar un entorno desplegado.
 *
 * La URL ya no está fija en el código: se toma de E2E_BASE_URL. Si esa variable
 * apunta a producción, la suite que corre aquí (prod-verification.spec.ts) es de
 * SOLO LECTURA a propósito — ver el comentario de ese archivo.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: getBaseUrl(),
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