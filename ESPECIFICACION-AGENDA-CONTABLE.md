# Especificación — Módulo "Ventrix Contable" en la plataforma Ventrix

> Documento para el equipo/agente que trabaja el repo `komercio` (Ventrix).
> **Leer completo antes de escribir una sola línea de código.**
> El objetivo es sumar un segundo producto (agenda tributaria para contadores)
> a la plataforma Ventrix existente, reusando su infraestructura.

---

## 0. Contexto

Ventrix hoy es un **POS para comercios** (tiendas). Se va a agregar un segundo
producto sobre la MISMA plataforma: **Ventrix Contable**, una agenda tributaria
para **contadores** que gestionan a sus clientes (empresas/personas) y sus
vencimientos ante la DIAN en Colombia.

Ya existe una **implementación de referencia** de todo el dominio contable: una
app de escritorio (Tauri + React + SQLite). Los archivos clave ya están copiados
DENTRO de este repo, en la carpeta **`agenda-contable-referencia/`**:
- `0007_calendario_dian.sql` — semilla del calendario DIAN 2026 (290 filas, ya
  verificada contra el PDF oficial de la DIAN). **Portar tal cual** a Postgres.
- `0008_calendario_rst_naturales.sql` — RST + renta personas naturales (100 filas).
- `nit.ts` — fórmula exacta del dígito de verificación (DV).
- `db.ts.referencia` — lógica de dominio (crear/editar clientes, calendario,
  sugerencias) para portar.
- `types.ts.referencia` — reglas de calidades y exclusión RST.

Este documento es autosuficiente; esos archivos son para portar sin re-derivar
(sobre todo el calendario, que es peligroso rehacer a mano).

---

## 1. Principios marco (no negociables)

1. **Una plataforma, dos productos.** Mismo login, mismo sistema de cuentas,
   mismo cobro. Cambia la "cara" del producto y el tablero.
2. **SIN licencia / sin candado por máquina.** La app de escritorio tenía un
   licenciamiento atado al equipo (huella + firma). **Eso NO se porta.** En la
   web el acceso lo da la **suscripción**: `Business.plan` + `planExpiresAt` +
   Wompi, que ya existen. Nada de huellas ni activación por clave.
3. **Multi-tenant estricto.** Todo dato contable cuelga de un `Business` y jamás
   una oficina ve datos de otra. Igual que el POS hoy.
4. **Reusar, no reconstruir.** Auth, modelo `Business`, roles, cobros/Wompi,
   `planExpiresAt` y el sistema de diseño (emerald/Inter) ya están. Se reusan.

---

## 2. El split Comercio / Contador

### 2.1 Discriminador de producto: `Business.type`
- Agregar campo `type` al modelo `Business`: `"pos" | "contable"`.
- Los negocios existentes quedan `"pos"` por defecto (migración).
- Se define en el **registro** con una pregunta: *"¿Qué eres? Comercio / Contador"*.

### 2.2 Redirección tras login
Hoy (`frontend/src/app/login/page.tsx` ~línea 182):
```
SUPER_ADMIN         → /superadmin
resto               → /dashboard   (POS)
```
Nuevo:
```
SUPER_ADMIN                 → /superadmin
business.type === "contable" → /contable   ← nuevo
resto                        → /dashboard  (POS, como hoy)
```
El payload del login **ya devuelve** `businessId`, `businessName`, `plan`
(ver `backend/src/controllers/auth.controller.ts`). Solo hay que **incluir
`type`** ahí para que el front decida el destino.

### 2.3 Grupos de ruta separados (con guarda)
- `app/(dashboard)/…` → POS (caja, inventario, ventas…). Solo cuentas `pos`.
- `app/(contable)/…`  → Agenda (panel, clientes, vencimientos, resoluciones).
  Solo cuentas `contable`.
- Cada grupo tiene su **guarda**: si una cuenta `pos` entra a `/contable`, se
  rebota a `/dashboard`, y viceversa.

### 2.4 Landing
- `ventrix.lat` (`app/page.tsx`) se queda como está: hero del POS.
- **Nueva página** `app/contable/page.tsx` → landing propio para contadores,
  con su propio mensaje (ej. *"Nunca más una declaración tarde"*). Mismo
  "Crear cuenta / Ya tengo cuenta" por debajo.
- Enlace en el header: *"Para contadores"* ↔ *"Para comercios"*.

---

## 3. Roles y permisos

### 3.1 Recomendado (Opción A)
- El **dueño** de cualquier cuenta es **ADMIN** (sea tendero o contador). El
  producto lo define `business.type`, NO un rol nuevo.
- Agregar **un solo rol nuevo**: `AUXILIAR` — el ayudante del contador, con
  permisos limitados. Es el único rol que aporta capacidad nueva.

### 3.2 DECISIÓN PENDIENTE (confirmar con el dueño del producto)
Existe una Opción B: agregar un rol `CONTADOR` (idéntico en permisos a ADMIN)
solo para que la cuenta del contador **se etiquete** "Contador" en vez de
"Admin". Es válido, pero implica que **cada `authorize('ADMIN', …)` del backend
debe aceptar también `CONTADOR`** (más puntos que mantener). Recomendación:
Opción A salvo que el dueño quiera la etiqueta explícita.

### 3.3 NO quitar `SUPERVISOR` como parte de esto
`SUPERVISOR` está usado en **16 archivos de rutas** del POS (`authorize('ADMIN',
'SUPERVISOR', …)`). Quitarlo exige editarlos todos + migrar usuarios existentes
(Postgres no deja borrar un valor de enum en uso). Es trabajo del **POS**, no de
la Agenda. **No mezclar** con este módulo; si se quiere, es una limpieza aparte.

### 3.4 Permisos de AUXILIAR (limitado)
- ✅ Ver clientes, ver/crear/editar vencimientos, marcar estados, ver
  resoluciones y calendario.
- ❌ Eliminar clientes, editar configuración de la cuenta, invitar/gestionar
  usuarios, ver cobros/plan.
(El dueño ADMIN puede todo.)

---

## 4. Modelo de datos (dominio contable)

Todo lo "por cliente" cuelga de `Business` (multi-tenant). Los **catálogos** y
los **calendarios** son globales (iguales para todas las oficinas).

> ⚠️ **Colisión de nombres:** el POS ya tiene un modelo `Customer` (los
> compradores de la tienda). Los "clientes" del contador son OTRA cosa
> (empresas/personas que él le lleva la contabilidad). Nombrar el modelo nuevo
> distinto, p. ej. **`TaxClient`** (o `ClienteContable`). NO reusar `Customer`.

### 4.1 `TaxClient` (cliente del contador) — scoped a Business
| Campo | Tipo | Notas |
|---|---|---|
| `businessId` | FK | multi-tenant |
| `razonSocial` | string | "Nombres o razón social" |
| `nit` | string | solo dígitos |
| `dv` | int | dígito de verificación — **se calcula solo** con la fórmula oficial DIAN (ver §5.4) |
| `celular` | string? | opcional |
| `direccion` | string? | opcional |
| `tipoPersona` | enum | `natural` \| `juridica` |
| `responsabilidades` | enum[] | calidades tributarias (ver 4.2). En Postgres, **array de enum** (más simple que tabla puente) |
| `ivaPeriodicidad` | enum? | `bimestral` \| `cuatrimestral` \| null. Solo si es responsable de IVA; null en caso contrario |
| `activo` | bool | soft-delete lógico |
| timestamps | | |

Índice único sugerido: `(businessId, nit, dv)` — no repetir un cliente por NIT
dentro de la misma oficina.

> No portar los campos `regimen` ni `gran_contribuyente` de la app de escritorio:
> el primero era compatibilidad heredada, el segundo nunca se usó.

### 4.2 Calidades tributarias (`responsabilidades`)
Catálogo FIJO (modelar como enum): 
- `responsable_iva` — Responsable de IVA
- `declarante_renta` — Declarante de renta
- `agente_retenedor` — Agente retenedor
- `impoconsumo` — Impoconsumo
- `rst` — Régimen Simple de Tributación

Regla: **la ausencia de `responsable_iva` = No responsable de IVA.** No existe un
código para "no responsable" (evita estados imposibles).

### 4.3 Obligaciones (catálogo)
Catálogo FIJO (enum + periodicidad):
| Código | Etiqueta | Periodicidad |
|---|---|---|
| `renta` | Renta | anual |
| `iva` | IVA | bimestral o cuatrimestral (según cliente) |
| `retefuente` | Retención en la fuente | mensual |
| `ica` | ICA | bimestral |
| `exogena` | Información exógena | anual |
| `pila` | PILA — Seguridad social | mensual |
| `impoconsumo` | Impoconsumo | bimestral |
| `simple` | Régimen Simple (SIMPLE) | bimestral (anticipo) |

### 4.4 `Vencimiento` — scoped vía TaxClient
| Campo | Tipo | Notas |
|---|---|---|
| `taxClientId` | FK | |
| `obligacion` | enum | uno de §4.3 |
| `periodo` | string | ej. "Ene-Feb", "2026-05", "Año 2025 - 1a cuota" |
| `fecha` | date | vencimiento; **se propone desde el calendario** (ver §5.3) pero es editable |
| `estado` | enum | `pendiente` \| `en_proceso` \| `presentada` \| `pagada` \| `vencida` |
| `monto` | decimal? | opcional |
| `notas` | string? | opcional |
Único sugerido: `(taxClientId, obligacion, periodo)`.

### 4.5 `ResolucionDian` — scoped vía TaxClient
Campos: `taxClientId`, `tipo` (`facturacion_numeracion` \| `habilitacion_electronica`
\| `otra`), `numero`, `fechaExpedicion`, `prefijo?`, `rangoDesde?`, `rangoHasta?`,
`consecutivoActual`, `modalidad?` (`pos` \| `electronica` \| `contingencia`),
`fechaVigencia`, `estado` (`vigente` \| `por_vencer` \| `vencida` \| `agotada`),
`notas?`.

### 4.6 `CalendarioDian` (GLOBAL, no por Business)
Fecha de vencimiento por obligación/variante/periodo y **último dígito del NIT**.
| Campo | Tipo |
|---|---|
| `anio` | int (2026) |
| `obligacion` | string (coincide con §4.3) |
| `variante` | string? (`bimestral`\|`cuatrimestral` para IVA; `juridica`\|`natural` para renta; null para retención/simple) |
| `periodo` | string ("Ene-Feb", "Enero", "Año 2025 - 1a cuota"…) |
| `periodoOrden` | int (orden en el selector) |
| `digito` | int 0–9 (último dígito del NIT) |
| `fecha` | date |
Índice: `(anio, obligacion, variante, digito)`.

**Semilla 2026 ya lista y verificada** (290 filas) en el archivo de referencia
`0007_calendario_dian.sql`. Cubre: IVA bimestral, IVA cuatrimestral, retención en
la fuente (12 meses), renta personas jurídicas, y RST anticipo bimestral
(`obligacion='simple'`). **Portar esas filas tal cual.**

### 4.7 `CalendarioRentaNatural` (GLOBAL)
Renta de personas naturales: la clave son los **DOS últimos dígitos** del NIT/
cédula (00–99), no uno solo. Una sola declaración anual escalonada ago–oct.
| Campo | Tipo |
|---|---|
| `anio` | int (2026) |
| `dosDigitos` | int 0–99 |
| `fecha` | date |
Semilla ya lista (100 filas) en `0008_calendario_rst_naturales.sql`. Portar.

---

## 5. Reglas de negocio (críticas — validadas con un contador)

### 5.1 Exclusión del Régimen Simple (RST)
Si un cliente tiene marcado `rst`, **NO puede** tener además `declarante_renta`
ni `agente_retenedor` (son excluyentes). La UI debe bloquear esas casillas
cuando RST está activo, y viceversa; y el backend debe rechazar/normalizar la
combinación al guardar (defensa en profundidad). `declarante_renta` +
`agente_retenedor` entre sí SÍ se combinan. `impoconsumo` es compatible con todo.
> Pendiente que el contador confirme: si un RST puede ser agente de retención de
> IVA (hoy la regla lo excluye de "agente retenedor" en general).

### 5.2 Periodicidad de IVA
`ivaPeriodicidad` solo aplica si el cliente es `responsable_iva`. Si deja de
serlo, guardar `null`. Se elige en la ficha: Bimestral o Cuatrimestral.

### 5.3 Fecha automática por NIT (el "BUSCARV" del contador)
Al crear un vencimiento, elegido cliente + obligación + periodo, la fecha se
**propone sola**:
- Regla general: por el **último dígito** del NIT → consulta `CalendarioDian`
  (obligación + variante + digito).
- Excepción: **renta de personas naturales** → por los **dos últimos dígitos**
  → consulta `CalendarioRentaNatural`.
- La **variante** se deduce: para `iva` → `ivaPeriodicidad` del cliente; para
  `renta` → `tipoPersona` (`juridica`/`natural`).
- La fecha propuesta **es editable** (prórrogas, casos especiales).
- Si la obligación no está en el calendario (ICA, PILA, exógena), el campo de
  fecha queda manual.

### 5.4 Cálculo del dígito de verificación (DV)
Se calcula solo a partir del NIT con la fórmula oficial de la DIAN (pesos
`[3,7,13,17,19,23,29,37,41,43,47,53,59,67,71]` sobre los dígitos de derecha a
izquierda, módulo 11). Ver `src/lib/nit.ts` en la app de referencia para la
implementación exacta.

### 5.5 Sugerencias de obligaciones faltantes
En la pestaña Vencimientos, mostrar qué obligaciones le faltan a cada cliente
**según sus calidades**, mapeando:
| Calidad | Obligación sugerida |
|---|---|
| `responsable_iva` | `iva` |
| `declarante_renta` | `renta` |
| `agente_retenedor` | `retefuente` |
| `impoconsumo` | `impoconsumo` |
| `rst` | `simple` |
ICA, PILA y exógena **no** se sugieren (no se deducen de las calidades: dependen
de municipio, empleados y topes). Al pulsar una sugerencia, se prellena el
formulario (cliente + obligación); faltan solo periodo y fecha.

---

## 6. Pantallas / funcionalidad (tablero `(contable)`)

Sidebar: **Panel · Clientes · Vencimientos · Resoluciones DIAN**.
(La "Bóveda" de credenciales de la app de escritorio **NO va en Fase 1** — ver §7.)

### 6.1 Panel (dashboard)
- Próximos vencimientos (siguientes ~15 días).
- Resoluciones DIAN por vencer (~30 días).
- Filas resaltadas: vencidas (rojo), pagadas (verde).

### 6.2 Clientes
- Lista en tabla: Nombres/razón social · Identificación (NIT-DV) · Celular ·
  Tipo · Calidades (resumen tipo "IVA (bim.) · Renta").
- Botón **+ Nuevo cliente** y **Editar** → abren un **cuadro modal** (misma ficha
  para crear y editar). Campos: nombres/razón social, identificación (DV
  automático), celular, dirección; tipo de persona (natural/jurídica); bloque IVA
  (responsable/no + periodicidad si aplica); otras calidades (casillas con la
  regla RST del §5.1).
- Buscador por nombre o identificación (con o sin el guion del DV).
- Eliminar cliente: confirma y arrastra sus vencimientos/resoluciones.

### 6.3 Vencimientos
- Buscador por nombre o identificación (independiente de la selección de
  cliente — no obligar a ir a la pestaña Clientes).
- Formulario de alta: selector de cliente + obligación + periodo + fecha
  (fecha automática por NIT, §5.3).
- **Recuadro de sugerencias** (§5.5).
- **Pestañas por obligación**: IVA, Renta, Retención, PILA, ICA, etc. — cada una
  con un contador y su propia tabla. Un cliente con varias obligaciones aparece
  en cada pestaña que le corresponde. Botón "Todas" para ver todo apilado.
- Cada fila: cliente · periodo · fecha · estado (selector) · eliminar.

### 6.4 Resoluciones DIAN
- Alta y listado por cliente, con vigencia y estado.

---

## 7. Fuera de alcance de la Fase 1 (dejar anotado, NO construir aún)

- **Bóveda de credenciales** (usuario/clave DIAN de los clientes). Es lo más
  sensible: guardar claves de terceros en la nube = responsabilidad de Habeas
  Data (Ley 1581) + riesgo. Se diseña aparte, con cifrado del lado del cliente,
  en Fase 2. **No incluir en el primer release.**
- **Cualquier licenciamiento por máquina.** No aplica en web.
- **ICA / PILA / exógena** con fecha automática (no se deducen; fecha manual).
- **RST declaración anual consolidada** y **Grandes contribuyentes** en el
  calendario automático. Registrados como pendientes.
- Calendario de otros años: hoy solo 2026. Cada año se siembra el nuevo decreto.

---

## 8. Modelo de negocio (para contexto — no es código)

- El acceso lo controla la suscripción existente (`plan` + `planExpiresAt` +
  Wompi). El "modelo anual" se apoya en `planExpiresAt`: al vencer, **gatear el
  calendario del año nuevo** (o dejar en solo-lectura), no borrar datos.
- Precios previstos (referencia): plan por asiento — Contador (dueño) y cada
  Auxiliar. No afecta el código de este módulo salvo el gateo por `planExpiresAt`.

---

## 9. Orden sugerido de implementación (Fase 1)

1. `Business.type` + migración (existentes → "pos") + incluir `type` en el
   payload de login.
2. Registro con la pregunta "¿Comercio o Contador?" + rol `AUXILIAR`.
3. Redirección por `business.type` + grupo de rutas `(contable)` con guarda.
4. Modelos Prisma del dominio (§4) scoped a Business + catálogos + calendarios.
5. Semillas de calendario 2026 (portar 0007 y 0008).
6. Endpoints CRUD (clientes, vencimientos, resoluciones) con aislamiento por
   Business y permisos por rol.
7. Pantallas del tablero `(contable)` (§6), portando la UX de la app de
   escritorio.
8. Landing `/contable`.

**Confirmar antes de empezar:** la DECISIÓN PENDIENTE de §3.2 (rol `CONTADOR`
etiqueta sí/no).
