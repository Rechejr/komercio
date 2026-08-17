import request from 'supertest';
import app from '../../app';

// La documentación describe TODA la superficie de la API, así que en producción
// está apagada salvo que se configure DOCS_TOKEN. Estas pruebas fijan esa regla:
// un despliegue no debería exponer el mapa completo sin querer.

const NODE_ENV_ORIGINAL = process.env.NODE_ENV;
const DOCS_TOKEN_ORIGINAL = process.env.DOCS_TOKEN;

afterEach(() => {
  process.env.NODE_ENV = NODE_ENV_ORIGINAL;
  if (DOCS_TOKEN_ORIGINAL === undefined) delete process.env.DOCS_TOKEN;
  else process.env.DOCS_TOKEN = DOCS_TOKEN_ORIGINAL;
});

describe('GET /api/v1/docs.json', () => {
  it('en desarrollo se sirve sin restricción', async () => {
    process.env.NODE_ENV = 'test';
    const res = await request(app).get('/api/v1/docs.json');
    expect(res.status).toBe(200);
    expect(res.body.info.title).toBe('Ventrix API');
    expect(Object.keys(res.body.paths).length).toBeGreaterThan(100);
  });

  it('en producción NO existe si no se configuró DOCS_TOKEN', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DOCS_TOKEN;
    const res = await request(app).get('/api/v1/docs.json');
    expect(res.status).toBe(404);
    expect(res.body.paths).toBeUndefined();
  });

  it('en producción rechaza un token equivocado (404, no 401: no confirma que exista)', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DOCS_TOKEN = 'la-clave-buena';
    const res = await request(app).get('/api/v1/docs.json?token=otra');
    expect(res.status).toBe(404);
  });

  it('en producción se abre con el token correcto', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DOCS_TOKEN = 'la-clave-buena';

    const porQuery = await request(app).get('/api/v1/docs.json?token=la-clave-buena');
    expect(porQuery.status).toBe(200);
    expect(porQuery.body.info.title).toBe('Ventrix API');

    const porCabecera = await request(app).get('/api/v1/docs.json').set('X-Docs-Token', 'la-clave-buena');
    expect(porCabecera.status).toBe(200);
  });
});

describe('GET /api/v1/docs (Swagger UI)', () => {
  it('sirve la página en desarrollo', async () => {
    process.env.NODE_ENV = 'test';
    const res = await request(app).get('/api/v1/docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ventrix API');
  });

  it('tampoco existe en producción sin token', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DOCS_TOKEN;
    const res = await request(app).get('/api/v1/docs/');
    expect(res.status).toBe(404);
  });
});
