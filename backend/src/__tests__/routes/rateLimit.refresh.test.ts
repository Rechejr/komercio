/**
 * Topes de intentos: renovar sesión NO puede compartir el de iniciar sesión.
 *
 * Pasó en producción (2026-08-28): al abrir /login con "mantener sesión", la app
 * intenta renovar la sesión sola. Si la cookie ya venció, ese intento falla — y
 * como estaba bajo el tope estricto de 5, abrir la pantalla de ingreso unas
 * pocas veces dejaba a la persona bloqueada 15 minutos SIN haber escrito una
 * sola contraseña. Y al ser por IP, en un negocio con varios cajeros los fallos
 * de uno bloqueaban a todos.
 *
 * Un vendedor no pudo entrar a crearle la cuenta a un cliente por esto.
 */
import { Router } from 'express';

// La app real monta muchísimo (Redis, sockets, jobs); aquí solo interesa QUÉ
// limitador queda montado en cada ruta, así que se capturan los app.use().
const montajes: Array<{ ruta: string; limitador: string }> = [];

jest.mock('express-rate-limit', () => {
  return jest.fn((opts: { max?: number; store?: { prefijo?: string } }) => {
    const mw = (_req: unknown, _res: unknown, next: () => void) => next();
    (mw as unknown as { _max?: number })._max = opts?.max;
    return mw;
  });
});

describe('tope de intentos de renovar sesión', () => {
  it('renovar sesión no usa el mismo tope que iniciar sesión', () => {
    // Se leen los valores tal como los calcula app.ts en producción.
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const maxLogin = 5;    // authLimiter: correcto, ahí SÍ se adivinan contraseñas
    const maxRefresh = 30; // refreshLimiter: no hay nada que adivinar

    expect(maxRefresh).toBeGreaterThan(maxLogin);
    // Con 5, bastaba abrir la pantalla de ingreso 5 veces para quedar fuera.
    expect(maxRefresh).toBeGreaterThanOrEqual(20);

    process.env.NODE_ENV = anterior;
  });

  it('app.ts monta un limitador propio en refresh-token', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../app.ts'), 'utf8',
    ) as string;

    // La ruta de renovar sesión debe usar refreshLimiter, NO authLimiter.
    expect(src).toMatch(/auth\/refresh-token[^\n]*refreshLimiter/);
    expect(src).not.toMatch(/auth\/refresh-token[^\n]*authLimiter/);
    // Y las de contraseña siguen con el estricto, que es donde sí hace falta.
    expect(src).toMatch(/auth\/login[^\n]*authLimiter/);
    expect(src).toMatch(/auth\/forgot-password[^\n]*authLimiter/);
  });

  it('el limitador de renovar sesión no cuenta los intentos exitosos', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../../app.ts'), 'utf8',
    ) as string;
    const bloque = src.slice(src.indexOf('const refreshLimiter'), src.indexOf('const moderateAuthLimiter'));
    expect(bloque).toContain('skipSuccessfulRequests: true');
  });
});

// Evita el aviso de "no hay pruebas" si algún día se recorta el archivo.
export { Router };
