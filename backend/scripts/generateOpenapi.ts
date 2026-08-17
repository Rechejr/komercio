/**
 * Genera la especificación OpenAPI leyendo el CÓDIGO de las rutas.
 *
 * Se hace así, y no a mano, porque una documentación escrita aparte se
 * desactualiza a la primera semana. Aquí la fuente de verdad es src/routes/*.ts:
 * el script recorre el AST de TypeScript y saca de cada `router.get/post/...`
 * la ruta, el rol exigido por `authorize(...)` y los campos con sus reglas de
 * express-validator (tipo, requerido, enum, mínimos y máximos).
 *
 * Correr con `npm run docs:openapi`. La prueba openapi.test.ts falla si se
 * agrega una ruta y no se regenera el archivo.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');
const ROUTES_DIR = path.join(ROOT, 'src', 'routes');
const APP_FILE = path.join(ROOT, 'src', 'app.ts');
const OUT_FILE = path.join(ROOT, 'src', 'docs', 'openapi.json');

const METODOS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Metodo = (typeof METODOS)[number];

interface Campo {
  nombre: string;
  tipo: string;
  formato?: string;
  requerido: boolean;
  enum?: string[];
  minimo?: number;
  maximo?: number;
  descripcion?: string;
}

interface Endpoint {
  metodo: Metodo;
  ruta: string;          // ya con el prefijo de montaje
  tag: string;
  resumen?: string;
  /** Esquema de seguridad que aplica, o null si la ruta es pública. El portal de
   *  vendedoras tiene su propia sesión (authSeller, JWT con kind:'seller'), así
   *  que no basta con buscar `authenticate`. */
  seguridad: 'bearerAuth' | 'sellerAuth' | null;
  roles: string[];
  campos: Campo[];
  query: Campo[];
}

/** Middleware de autenticación presente en el texto de una ruta. */
function seguridadEn(texto: string): 'bearerAuth' | 'sellerAuth' | null {
  if (/\bauthSeller\b/.test(texto)) return 'sellerAuth';
  if (/\bauthenticate\b/.test(texto)) return 'bearerAuth';
  return null;
}

// ─── Utilidades de AST ────────────────────────────────────────────────────────

function leerFuente(archivo: string): ts.SourceFile {
  return ts.createSourceFile(archivo, fs.readFileSync(archivo, 'utf8'), ts.ScriptTarget.Latest, true);
}

/** Texto de un literal ('x' o `x`), o undefined si no lo es. */
function textoLiteral(nodo: ts.Node): string | undefined {
  if (ts.isStringLiteral(nodo) || ts.isNoSubstitutionTemplateLiteral(nodo)) return nodo.text;
  // `${apiPrefix}/auth` → se resuelve el prefijo conocido más el resto.
  if (ts.isTemplateExpression(nodo)) {
    const cola = nodo.templateSpans.map((s) => s.literal.text).join('');
    return `/api/v1${cola}`;
  }
  return undefined;
}

/** Desenrolla `body('x').isUUID().withMessage('..')` a la lista de llamadas. */
function cadenaDeLlamadas(nodo: ts.CallExpression): { nombre: string; args: ts.NodeArray<ts.Expression> }[] {
  const pasos: { nombre: string; args: ts.NodeArray<ts.Expression> }[] = [];
  let actual: ts.Expression = nodo;
  while (ts.isCallExpression(actual)) {
    const callee = actual.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      pasos.unshift({ nombre: callee.name.text, args: actual.arguments });
      actual = callee.expression;
    } else if (ts.isIdentifier(callee)) {
      pasos.unshift({ nombre: callee.text, args: actual.arguments });
      break;
    } else break;
  }
  return pasos;
}

/** Valor de una propiedad numérica de un objeto literal: { min: 1 } → 1. */
function numeroDeOpcion(args: ts.NodeArray<ts.Expression>, clave: string): number | undefined {
  const obj = args[0];
  if (!obj || !ts.isObjectLiteralExpression(obj)) return undefined;
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop) && prop.name.getText() === clave && ts.isNumericLiteral(prop.initializer)) {
      return Number(prop.initializer.text);
    }
  }
  return undefined;
}

/** Comentario de línea inmediatamente anterior, como resumen del endpoint. */
function comentarioPrevio(nodo: ts.Node, fuente: ts.SourceFile): string | undefined {
  const rangos = ts.getLeadingCommentRanges(fuente.getFullText(), nodo.getFullStart());
  if (!rangos?.length) return undefined;
  const texto = rangos
    .map((r) => fuente.getFullText().slice(r.pos, r.end))
    .join(' ')
    .replace(/\/\*\*?|\*\/|^\s*\*\s?/gm, '')
    .replace(/\/\//g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return texto ? texto.slice(0, 300) : undefined;
}

// ─── Extracción de validaciones ───────────────────────────────────────────────

function campoDesdeValidador(nodo: ts.CallExpression): { campo: Campo; origen: string } | null {
  const pasos = cadenaDeLlamadas(nodo);
  if (!pasos.length) return null;
  const base = pasos[0];
  if (!['body', 'param', 'query', 'header'].includes(base.nombre)) return null;
  const nombre = base.args[0] ? textoLiteral(base.args[0]) : undefined;
  if (!nombre) return null;

  const campo: Campo = { nombre, tipo: 'string', requerido: true };

  for (const paso of pasos.slice(1)) {
    switch (paso.nombre) {
      case 'optional': campo.requerido = false; break;
      case 'isUUID': campo.tipo = 'string'; campo.formato = 'uuid'; break;
      case 'isEmail': campo.tipo = 'string'; campo.formato = 'email'; break;
      case 'isURL': campo.tipo = 'string'; campo.formato = 'uri'; break;
      case 'isISO8601': campo.tipo = 'string'; campo.formato = 'date-time'; break;
      case 'isBoolean': campo.tipo = 'boolean'; break;
      case 'isNumeric':
      case 'isDecimal':
      case 'isFloat': campo.tipo = 'number'; campo.minimo = numeroDeOpcion(paso.args, 'min'); campo.maximo = numeroDeOpcion(paso.args, 'max'); break;
      case 'isInt': campo.tipo = 'integer'; campo.minimo = numeroDeOpcion(paso.args, 'min'); campo.maximo = numeroDeOpcion(paso.args, 'max'); break;
      case 'isArray': campo.tipo = 'array'; campo.minimo = numeroDeOpcion(paso.args, 'min'); break;
      case 'isObject': campo.tipo = 'object'; break;
      case 'isLength': campo.minimo = numeroDeOpcion(paso.args, 'min'); campo.maximo = numeroDeOpcion(paso.args, 'max'); break;
      case 'isIn': {
        const arr = paso.args[0];
        if (arr && ts.isArrayLiteralExpression(arr)) {
          const valores = arr.elements.map((e) => textoLiteral(e)).filter((v): v is string => !!v);
          if (valores.length) campo.enum = valores;
        }
        break;
      }
      case 'withMessage': {
        const msg = paso.args[0] ? textoLiteral(paso.args[0]) : undefined;
        if (msg && !campo.descripcion) campo.descripcion = msg;
        break;
      }
    }
  }
  return { campo, origen: base.nombre };
}

/** Recoge todos los validadores que aparezcan dentro de los argumentos. */
function validadoresDe(args: readonly ts.Expression[]): { body: Campo[]; query: Campo[] } {
  const body: Campo[] = [];
  const query: Campo[] = [];
  const visitar = (nodo: ts.Node) => {
    if (ts.isCallExpression(nodo)) {
      const res = campoDesdeValidador(nodo);
      if (res) {
        (res.origen === 'query' ? query : res.origen === 'body' ? body : []).push(res.campo);
        return; // no hace falta bajar más en esta cadena
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  args.forEach(visitar);
  return { body, query };
}

/** Roles exigidos por `authorize('ADMIN', 'SUPERVISOR')` en los argumentos. */
function rolesDe(args: readonly ts.Expression[]): string[] {
  const roles: string[] = [];
  const visitar = (nodo: ts.Node) => {
    if (ts.isCallExpression(nodo) && ts.isIdentifier(nodo.expression) && nodo.expression.text === 'authorize') {
      nodo.arguments.forEach((a) => { const t = textoLiteral(a); if (t) roles.push(t); });
    }
    ts.forEachChild(nodo, visitar);
  };
  args.forEach(visitar);
  return roles;
}

// ─── Lectura de app.ts: prefijo de montaje por archivo de rutas ───────────────

function prefijosPorArchivo(): Map<string, string> {
  const fuente = leerFuente(APP_FILE);
  const importes = new Map<string, string>(); // identificador → archivo
  const prefijos = new Map<string, string>(); // archivo → prefijo

  fuente.forEachChild((nodo) => {
    if (ts.isImportDeclaration(nodo) && nodo.importClause?.name) {
      const desde = textoLiteral(nodo.moduleSpecifier);
      if (desde?.includes('routes/')) importes.set(nodo.importClause.name.text, `${path.basename(desde)}.ts`);
    }
  });

  const visitar = (nodo: ts.Node) => {
    if (ts.isCallExpression(nodo) && ts.isPropertyAccessExpression(nodo.expression)
      && nodo.expression.name.text === 'use' && nodo.arguments.length >= 2) {
      const ruta = textoLiteral(nodo.arguments[0]);
      for (const arg of nodo.arguments.slice(1)) {
        if (ts.isIdentifier(arg) && importes.has(arg.text) && ruta) {
          prefijos.set(importes.get(arg.text)!, ruta);
        }
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return prefijos;
}

// ─── Recorrido de un archivo de rutas ─────────────────────────────────────────

function endpointsDeArchivo(archivo: string, prefijo: string, tag: string): Endpoint[] {
  const fuente = leerFuente(path.join(ROUTES_DIR, archivo));
  const texto = fuente.getFullText();
  // `router.use(authenticate)` protege todo el archivo.
  const usoGlobalAuth = texto.match(/router\.use\(([^)]*)\)/g)?.join(' ') ?? '';
  const seguridadGlobal = seguridadEn(usoGlobalAuth);
  const rolesGlobales: string[] = [];
  const usoGlobal = texto.match(/router\.use\([^)]*authorize\(([^)]*)\)/);
  if (usoGlobal) rolesGlobales.push(...(usoGlobal[1].match(/'([^']+)'/g) || []).map((s) => s.replace(/'/g, '')));

  const endpoints: Endpoint[] = [];

  const visitar = (nodo: ts.Node) => {
    if (ts.isCallExpression(nodo) && ts.isPropertyAccessExpression(nodo.expression)) {
      const objeto = nodo.expression.expression;
      const metodo = nodo.expression.name.text as Metodo;
      if (ts.isIdentifier(objeto) && objeto.text === 'router' && METODOS.includes(metodo)) {
        const rutaRel = nodo.arguments[0] ? textoLiteral(nodo.arguments[0]) : undefined;
        if (rutaRel !== undefined) {
          const resto = nodo.arguments.slice(1);
          const { body, query } = validadoresDe(resto);
          const roles = [...new Set([...rolesGlobales, ...rolesDe(resto)])];
          const seguridad = seguridadGlobal ?? seguridadEn(resto.map((r) => r.getText()).join(' '));
          endpoints.push({
            metodo,
            ruta: (prefijo + (rutaRel === '/' ? '' : rutaRel)) || '/',
            tag,
            resumen: comentarioPrevio(nodo.parent ?? nodo, fuente),
            seguridad,
            roles,
            campos: body,
            query,
          });
        }
      }
    }
    ts.forEachChild(nodo, visitar);
  };
  visitar(fuente);
  return endpoints;
}

// ─── Construcción del documento OpenAPI ───────────────────────────────────────

const esquemaDeCampo = (c: Campo) => {
  const base: Record<string, unknown> = { type: c.tipo };
  if (c.formato) base.format = c.formato;
  if (c.enum) base.enum = c.enum;
  if (c.descripcion) base.description = c.descripcion;
  if (c.tipo === 'array') {
    base.items = { type: 'object' };
    if (c.minimo !== undefined) base.minItems = c.minimo;
  } else if (c.tipo === 'number' || c.tipo === 'integer') {
    if (c.minimo !== undefined) base.minimum = c.minimo;
    if (c.maximo !== undefined) base.maximum = c.maximo;
  } else if (c.tipo === 'string') {
    if (c.minimo !== undefined) base.minLength = c.minimo;
    if (c.maximo !== undefined) base.maxLength = c.maximo;
  }
  return base;
};

/** Agrupa `items.*.productId` dentro de `items` para que el body refleje la
 *  forma real del JSON en vez de una lista plana de nombres con puntos. */
function esquemaDelCuerpo(campos: Campo[]) {
  const props: Record<string, unknown> = {};
  const requeridos: string[] = [];

  for (const campo of campos) {
    const [raiz, comodin, hijo] = campo.nombre.split('.');
    if (comodin === '*' && hijo) {
      // `items` puede haberse declarado antes como array suelto (isArray) o
      // llegar aquí primero: en ambos casos se completa su esquema de items.
      const previo = props[raiz] as { type?: string; items?: Record<string, unknown>; minItems?: number } | undefined;
      const contenedor = {
        ...previo,
        type: 'array',
        items: { type: 'object', properties: {}, required: [] as string[], ...(previo?.items as object) },
      } as { items: { properties: Record<string, unknown>; required: string[] } };
      contenedor.items.properties ??= {};
      contenedor.items.required ??= [];
      contenedor.items.properties[hijo] = esquemaDeCampo(campo);
      if (campo.requerido && !contenedor.items.required.includes(hijo)) contenedor.items.required.push(hijo);
      props[raiz] = contenedor;
    } else if (campo.nombre.includes('.')) {
      props[campo.nombre] = esquemaDeCampo(campo); // anidado profundo: se deja plano
      if (campo.requerido) requeridos.push(campo.nombre);
    } else {
      const anterior = props[campo.nombre] as { type?: string } | undefined;
      // Si ya se declaró como array por sus items, se conserva ese esquema.
      props[campo.nombre] = anterior?.type === 'array' ? { ...anterior, ...(campo.minimo !== undefined ? { minItems: campo.minimo } : {}) } : esquemaDeCampo(campo);
      if (campo.requerido) requeridos.push(campo.nombre);
    }
  }
  // Limpia los `required: []` vacíos de los items.
  for (const valor of Object.values(props)) {
    const v = valor as { items?: { required?: string[] } };
    if (v?.items?.required && v.items.required.length === 0) delete v.items.required;
  }
  return { props, requeridos };
}

function construirSpec(endpoints: Endpoint[], tags: string[]) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const e of endpoints) {
    // Express usa :id; OpenAPI usa {id}.
    const rutaOpenapi = e.ruta.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
    const parametros: unknown[] = [];

    for (const m of e.ruta.matchAll(/:([A-Za-z0-9_]+)/g)) {
      parametros.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
    }
    for (const q of e.query) {
      parametros.push({ name: q.nombre, in: 'query', required: q.requerido, schema: esquemaDeCampo(q) });
    }

    const operacion: Record<string, unknown> = {
      tags: [e.tag],
      summary: e.resumen || `${e.metodo.toUpperCase()} ${rutaOpenapi}`,
      security: e.seguridad ? [{ [e.seguridad]: [] }] : [],
      responses: {
        '200': { description: 'Operación exitosa', content: { 'application/json': { schema: { $ref: '#/components/schemas/RespuestaOk' } } } },
        ...(e.campos.length ? { '400': { description: 'Datos inválidos', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } : {}),
        ...(e.seguridad ? { '401': { description: 'Sin sesión o token vencido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } : {}),
        ...(e.roles.length ? { '403': { description: `Requiere rol: ${e.roles.join(', ')}`, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } } } : {}),
      },
    };

    if (e.roles.length) {
      operacion.description = `Roles permitidos: ${e.roles.join(', ')}.`;
      operacion['x-roles'] = e.roles;
    }
    if (parametros.length) operacion.parameters = parametros;

    if (e.campos.length && e.metodo !== 'get') {
      const { props, requeridos } = esquemaDelCuerpo(e.campos);
      operacion.requestBody = {
        required: requeridos.length > 0,
        content: { 'application/json': { schema: { type: 'object', properties: props, ...(requeridos.length ? { required: requeridos } : {}) } } },
      };
    }

    paths[rutaOpenapi] ??= {};
    paths[rutaOpenapi][e.metodo] = operacion;
  }

  return {
    openapi: '3.0.3',
    info: {
      title: 'Ventrix API',
      version: '1.0.0',
      description:
        'API de Ventrix POS y Ventrix Contable. Generada automáticamente desde src/routes (`npm run docs:openapi`), '
        + 'así que refleja siempre las rutas, roles y validaciones que hay en el código.\n\n'
        + 'La sesión usa un access token corto (cabecera `Authorization: Bearer`) y una cookie httpOnly de refresh. '
        + 'Todo es multi-tenant: el negocio sale del token, nunca del cuerpo de la petición.',
    },
    servers: [
      { url: 'https://api.ventrix.lat/api/v1', description: 'Producción' },
      { url: 'http://localhost:4000/api/v1', description: 'Local' },
    ],
    tags: tags.map((t) => ({ name: t })),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Access token de un usuario (POS o Contable).' },
        sellerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Sesión del portal de vendedoras (/seller), separada de la de usuarios.' },
      },
      schemas: {
        RespuestaOk: {
          type: 'object',
          properties: { success: { type: 'boolean', example: true }, data: { description: 'Contenido de la respuesta' } },
        },
        Error: {
          type: 'object',
          properties: { success: { type: 'boolean', example: false }, error: { type: 'string', example: 'Mensaje del error' } },
        },
      },
    },
    paths,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function generarSpec() {
  const prefijos = prefijosPorArchivo();
  // docs.routes.ts queda fuera: la documentación no se documenta a sí misma.
  const archivos = fs.readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith('.routes.ts') && f !== 'docs.routes.ts')
    .sort();

  const endpoints: Endpoint[] = [];
  const tags: string[] = [];

  for (const archivo of archivos) {
    const tag = archivo.replace('.routes.ts', '');
    // health no se monta con prefijo (va en la raíz, para el healthcheck de Railway).
    const prefijo = prefijos.get(archivo) ?? (tag === 'health' ? '' : `/api/v1/${tag}`);
    const delArchivo = endpointsDeArchivo(archivo, prefijo, tag);
    if (delArchivo.length) { endpoints.push(...delArchivo); tags.push(tag); }
  }

  endpoints.sort((a, b) => a.ruta.localeCompare(b.ruta) || a.metodo.localeCompare(b.metodo));
  return { spec: construirSpec(endpoints, tags), total: endpoints.length };
}

if (require.main === module) {
  const { spec, total } = generarSpec();
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`OpenAPI: ${total} endpoints en ${Object.keys(spec.paths).length} rutas → ${path.relative(ROOT, OUT_FILE)}`);
}
