// ─── PERMISOS POR USUARIO ─────────────────────────────────────────────────────
// Hasta aquí los permisos vivían pegados al rol: `authorize('ADMIN','SUPERVISOR')`
// en cada ruta. Servía para el caso típico, pero no para el real — el dueño de
// una tienda quiere que SU cajero pueda ver reportes, o que un vendedor no pueda
// dar descuentos, sin cambiarle el rol a todo el mundo.
//
// Ahora cada acción tiene una llave y cada rol trae un juego de llaves por
// defecto. El dueño puede marcar o desmarcar llaves sueltas a un empleado
// (User.permissions), y eso pisa el default del rol SOLO para esa persona.
//
// IMPORTANTE: los defaults de abajo replican EXACTAMENTE lo que permitía el
// `authorize` de cada ruta antes de este cambio. Un negocio que ya venía
// trabajando no debe notar ninguna diferencia mientras no toque nada.

export type Producto = 'pos' | 'contable';

export interface Permiso {
  key: string;
  label: string;
  /** Qué implica, en palabras del dueño del negocio (se muestra en la pantalla). */
  hint?: string;
  modulo: string;
  producto: Producto;
}

// El orden importa: es el que se ve en la pantalla de permisos.
export const PERMISOS: Permiso[] = [
  // ── POS · Ventas ──
  { key: 'ventas.ver', label: 'Ver ventas', hint: 'Historial de ventas y el resumen del día', modulo: 'Ventas', producto: 'pos' },
  { key: 'ventas.crear', label: 'Registrar ventas', hint: 'Vender desde el POS', modulo: 'Ventas', producto: 'pos' },
  { key: 'ventas.anular', label: 'Anular y devolver', hint: 'Anular una venta o hacer una devolución', modulo: 'Ventas', producto: 'pos' },
  { key: 'ventas.eliminar', label: 'Eliminar ventas', hint: 'Borrado definitivo — normalmente solo el dueño', modulo: 'Ventas', producto: 'pos' },
  { key: 'cotizaciones.gestionar', label: 'Cotizaciones', hint: 'Crear y enviar cotizaciones', modulo: 'Ventas', producto: 'pos' },

  // ── POS · Caja ──
  { key: 'caja.operar', label: 'Abrir y cerrar caja', hint: 'Arqueo, entradas y salidas de efectivo', modulo: 'Caja', producto: 'pos' },
  { key: 'caja.historial', label: 'Ver historial de caja', hint: 'Cierres anteriores y diferencias', modulo: 'Caja', producto: 'pos' },

  // ── POS · Inventario ──
  { key: 'productos.ver', label: 'Ver productos', hint: 'Catálogo y existencias', modulo: 'Inventario', producto: 'pos' },
  { key: 'productos.gestionar', label: 'Crear y editar productos', hint: 'Incluye precios y ajustes de stock', modulo: 'Inventario', producto: 'pos' },
  { key: 'productos.eliminar', label: 'Eliminar productos', modulo: 'Inventario', producto: 'pos' },
  { key: 'productos.importar', label: 'Importar desde Excel', modulo: 'Inventario', producto: 'pos' },
  { key: 'inventario.transferir', label: 'Transferir entre bodegas', modulo: 'Inventario', producto: 'pos' },
  { key: 'categorias.gestionar', label: 'Categorías y marcas', modulo: 'Inventario', producto: 'pos' },

  // ── POS · Clientes y fiados ──
  { key: 'clientes.ver', label: 'Ver clientes', modulo: 'Clientes', producto: 'pos' },
  { key: 'clientes.gestionar', label: 'Crear y editar clientes', modulo: 'Clientes', producto: 'pos' },
  { key: 'clientes.eliminar', label: 'Eliminar clientes', modulo: 'Clientes', producto: 'pos' },
  { key: 'creditos.ver', label: 'Ver fiados', modulo: 'Clientes', producto: 'pos' },
  { key: 'creditos.gestionar', label: 'Fiar y recibir abonos', modulo: 'Clientes', producto: 'pos' },
  { key: 'creditos.anular', label: 'Anular fiados', modulo: 'Clientes', producto: 'pos' },

  // ── POS · Compras ──
  { key: 'compras.ver', label: 'Ver compras', modulo: 'Compras', producto: 'pos' },
  { key: 'compras.gestionar', label: 'Registrar y editar compras', modulo: 'Compras', producto: 'pos' },
  { key: 'compras.eliminar', label: 'Eliminar compras', modulo: 'Compras', producto: 'pos' },
  { key: 'proveedores.gestionar', label: 'Proveedores', hint: 'Crear y editar proveedores', modulo: 'Compras', producto: 'pos' },
  { key: 'cuentas_por_pagar.pagar', label: 'Pagar cuentas por pagar', modulo: 'Compras', producto: 'pos' },

  // ── POS · Gastos ──
  { key: 'gastos.ver', label: 'Ver gastos', modulo: 'Gastos', producto: 'pos' },
  { key: 'gastos.gestionar', label: 'Registrar gastos', modulo: 'Gastos', producto: 'pos' },
  { key: 'gastos.eliminar', label: 'Eliminar gastos', modulo: 'Gastos', producto: 'pos' },

  // ── POS · Reportes ──
  { key: 'reportes.ver', label: 'Ver reportes', hint: 'Ventas por periodo, productos más vendidos', modulo: 'Reportes', producto: 'pos' },
  { key: 'reportes.financiero', label: 'Ver utilidades y costos', hint: 'Ganancia por venta y margen — dato sensible', modulo: 'Reportes', producto: 'pos' },
  { key: 'reportes.exportar', label: 'Descargar en Excel', modulo: 'Reportes', producto: 'pos' },

  // ── POS · Configuración ──
  { key: 'configuracion.negocio', label: 'Datos del negocio', hint: 'Nombre, logo, bodegas, medios de pago', modulo: 'Configuración', producto: 'pos' },
  { key: 'configuracion.usuarios', label: 'Gestionar usuarios', hint: 'Crear empleados y cambiarles permisos', modulo: 'Configuración', producto: 'pos' },

  // ── Contable ──
  { key: 'contable.clientes.ver', label: 'Ver clientes', hint: 'Los clientes tributarios de la oficina', modulo: 'Clientes', producto: 'contable' },
  { key: 'contable.clientes.gestionar', label: 'Crear y editar clientes', modulo: 'Clientes', producto: 'contable' },
  { key: 'contable.clientes.eliminar', label: 'Eliminar clientes', modulo: 'Clientes', producto: 'contable' },
  { key: 'contable.vencimientos.gestionar', label: 'Gestionar vencimientos', hint: 'Marcar presentado, agregar y borrar obligaciones', modulo: 'Vencimientos', producto: 'contable' },
  { key: 'contable.agenda.regenerar', label: 'Regenerar la agenda del año', hint: 'Rehace los vencimientos de TODOS los clientes', modulo: 'Vencimientos', producto: 'contable' },
  { key: 'contable.boveda.ver', label: 'Bóveda de claves', hint: 'Usuarios y contraseñas de los clientes (DIAN, bancos)', modulo: 'Bóveda', producto: 'contable' },
  { key: 'contable.documentos.gestionar', label: 'Documentos de clientes', hint: 'RUT, cámara de comercio, declaraciones', modulo: 'Bóveda', producto: 'contable' },
  { key: 'contable.oficina.configurar', label: 'Datos de la oficina', modulo: 'Configuración', producto: 'contable' },
  { key: 'contable.usuarios', label: 'Gestionar usuarios', hint: 'Crear auxiliares y cambiarles permisos', modulo: 'Configuración', producto: 'contable' },
];

export const TODAS_LAS_LLAVES = PERMISOS.map((p) => p.key);

/** Nombre de cada rol en la pantalla. El rol sigue siendo la plantilla inicial. */
export const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  CASHIER: 'Cajero',
  SELLER: 'Vendedor',
  WAREHOUSE: 'Bodeguero',
  AUXILIAR: 'Auxiliar',
};

export const ROL_HINT: Record<string, string> = {
  ADMIN: 'Acceso total. Es el dueño o quien administra por él.',
  SUPERVISOR: 'Casi todo menos la configuración del negocio y los borrados definitivos.',
  CASHIER: 'Vende, maneja la caja y los fiados. No toca inventario ni reportes.',
  SELLER: 'Solo vende y atiende clientes.',
  WAREHOUSE: 'Inventario y compras. No vende ni maneja plata.',
  AUXILIAR: 'Ayudante del contador: clientes y vencimientos, sin borrar ni tocar la cuenta.',
};

// Roles que el dueño puede asignar a un empleado, por producto. SUPER_ADMIN no
// se asigna nunca por esta vía.
export const ROLES_ASIGNABLES: Record<Producto, string[]> = {
  pos: ['ADMIN', 'SUPERVISOR', 'CASHIER', 'SELLER', 'WAREHOUSE'],
  contable: ['ADMIN', 'AUXILIAR'],
};

// ── Permisos por defecto de cada rol ─────────────────────────────────────────
// Calcados del `authorize` que tenía cada ruta antes de este cambio.
const POS_TODOS = ['ventas.ver', 'ventas.crear', 'productos.ver', 'compras.ver', 'reportes.exportar'];

export const DEFAULTS_POR_ROL: Record<string, string[]> = {
  // El dueño y el super admin no se filtran por esta tabla (ver puedeTodo), pero
  // se deja completa para que la pantalla muestre bien las casillas de un ADMIN.
  ADMIN: TODAS_LAS_LLAVES.filter((k) => !k.startsWith('contable.')),

  SUPERVISOR: [
    ...POS_TODOS,
    'ventas.anular', 'cotizaciones.gestionar',
    'caja.operar', 'caja.historial',
    'productos.gestionar', 'productos.eliminar', 'productos.importar',
    'inventario.transferir', 'categorias.gestionar',
    'clientes.ver', 'clientes.gestionar', 'clientes.eliminar',
    'creditos.ver', 'creditos.gestionar', 'creditos.anular',
    'compras.gestionar', 'compras.eliminar', 'proveedores.gestionar', 'cuentas_por_pagar.pagar',
    'gastos.ver', 'gastos.gestionar',
    'reportes.ver', 'reportes.financiero',
  ],

  CASHIER: [
    ...POS_TODOS,
    'caja.operar',
    'clientes.ver', 'clientes.gestionar',
    'creditos.ver', 'creditos.gestionar',
    'compras.gestionar', 'proveedores.gestionar', 'cuentas_por_pagar.pagar',
  ],

  SELLER: [
    ...POS_TODOS,
    'clientes.ver', 'clientes.gestionar',
  ],

  WAREHOUSE: [
    ...POS_TODOS,
    'productos.gestionar', 'productos.importar',
    'compras.gestionar',
  ],

  // Contable
  AUXILIAR: [
    'contable.clientes.ver', 'contable.clientes.gestionar',
    'contable.vencimientos.gestionar',
    'contable.boveda.ver', 'contable.documentos.gestionar',
  ],
};

/** El ADMIN de una oficina contable manda en todo lo del módulo contable. */
DEFAULTS_POR_ROL.ADMIN = [
  ...DEFAULTS_POR_ROL.ADMIN,
  ...TODAS_LAS_LLAVES.filter((k) => k.startsWith('contable.')),
];

/** Overrides guardados en User.permissions: llave → true (dar) / false (quitar). */
export type Overrides = Record<string, boolean>;

/** SUPER_ADMIN y el dueño del negocio nunca se quedan por fuera de nada. */
export function puedeTodo(role: string, esDueno: boolean): boolean {
  return role === 'SUPER_ADMIN' || esDueno;
}

export function permisosDeRol(role: string): string[] {
  return DEFAULTS_POR_ROL[role] ?? [];
}

/** Permisos reales de una persona: los de su rol, con sus marcas encima. */
export function permisosEfectivos(role: string, overrides?: unknown): string[] {
  const base = new Set(permisosDeRol(role));
  const marcas = normalizarOverrides(overrides);
  for (const [key, valor] of Object.entries(marcas)) {
    if (valor) base.add(key);
    else base.delete(key);
  }
  return TODAS_LAS_LLAVES.filter((k) => base.has(k));
}

/** Descarta llaves inventadas y valores que no sean booleanos. */
export function normalizarOverrides(overrides: unknown): Overrides {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return {};
  const limpio: Overrides = {};
  for (const [key, valor] of Object.entries(overrides as Record<string, unknown>)) {
    if (typeof valor === 'boolean' && TODAS_LAS_LLAVES.includes(key)) limpio[key] = valor;
  }
  return limpio;
}

/** Solo guarda lo que DIFIERE del rol: si el rol cambia, las marcas siguen teniendo sentido. */
export function soloDiferencias(role: string, overrides: Overrides): Overrides {
  const base = new Set(permisosDeRol(role));
  const limpio: Overrides = {};
  for (const [key, valor] of Object.entries(overrides)) {
    if (base.has(key) !== valor) limpio[key] = valor;
  }
  return limpio;
}
