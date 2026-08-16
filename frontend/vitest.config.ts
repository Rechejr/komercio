import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

// Pruebas del frontend: Vitest + Testing Library sobre jsdom.
// Se prueban las funciones de dominio (formatos, DV, reglas de vencimientos) y
// los componentes de UI reutilizables. Las pruebas de flujo completo contra el
// navegador siguen en /e2e con Playwright — no se duplican aquí.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Zona horaria fija: hay lógica (vencimientos DIAN, fechas de gráficas) que
    // depende de ella. Sin esto, una prueba pasa en Colombia y falla en el CI,
    // que corre en UTC.
    env: { TZ: 'America/Bogota' },
    css: false,
    restoreMocks: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
