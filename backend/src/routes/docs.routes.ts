import { Router, Request, Response, NextFunction } from 'express';
import swaggerUi from 'swagger-ui-express';
import openapi from '../docs/openapi.json';

// Documentación navegable de la API (Swagger UI) en /api/v1/docs, y el JSON
// crudo en /api/v1/docs.json para Postman o Insomnia.
//
// El archivo lo genera `npm run docs:openapi` leyendo src/routes, así que
// siempre refleja el código. La prueba openapi.test.ts falla si quedó viejo.
//
// SEGURIDAD: publicar el mapa completo de la API le sirve tanto al que integra
// como al que ataca. Por eso:
//   - en desarrollo está abierta;
//   - en producción está APAGADA salvo que se defina DOCS_TOKEN, y entonces hay
//     que entrar con ?token=<DOCS_TOKEN>. Sin la variable responde 404, como si
//     la ruta no existiera.
const router = Router();

function permitirAcceso(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV !== 'production') return next();

  const esperado = process.env.DOCS_TOKEN;
  if (!esperado) return res.status(404).json({ success: false, error: 'No encontrado' });

  const recibido = String(req.query.token || req.get('X-Docs-Token') || '');
  if (recibido !== esperado) return res.status(404).json({ success: false, error: 'No encontrado' });

  return next();
}

router.use(permitirAcceso);

router.get('/docs.json', (_req, res) => res.json(openapi));

router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, {
  customSiteTitle: 'Ventrix API',
  swaggerOptions: { docExpansion: 'none', filter: true, tagsSorter: 'alpha', operationsSorter: 'alpha' },
}));

export default router;
