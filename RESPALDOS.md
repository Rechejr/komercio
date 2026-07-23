# Respaldos y recuperación

Ventrix no guarda solo datos propios: guarda el **inventario, las ventas y los
fiados de los negocios de los clientes**. Perder esa información no es un
incidente técnico, es que un tendero deje de saber quién le debe plata.

Este documento define cómo se protege y, sobre todo, **cómo se recupera**.

> Un respaldo que nunca se probó no es un respaldo: es una suposición.

---

## Las tres capas

| Capa | Qué cubre | Quién la mantiene |
|------|-----------|-------------------|
| 1. Point-in-time restore de Neon | "Borré algo por error hace dos horas" | Neon, automático |
| 2. Volcado manual (`npm run db:backup`) | Perder acceso a la cuenta de Neon, degradación del plan, borrado del proyecto | Manual |
| 3. Simulacro de restauración | Que las capas 1 y 2 sirvan de verdad | Manual, periódico |

La capa 2 existe porque **un respaldo que vive en el mismo proveedor que el
original no protege de todo**. Si se pierde el acceso a la cuenta de Neon, el
historial se pierde con ella.

---

## Capa 1 — Verificar el historial de Neon

Esto es lo primero y lo más importante, porque ya está activo y solo hay que
confirmar cuánto cubre.

1. Entrar a [console.neon.tech](https://console.neon.tech) y abrir el proyecto.
2. Ir a **Settings → Storage** (o **Branches → History retention**).
3. Anotar el valor de **History retention / restore window**.

Qué significa el número:

- **24 horas** → plan gratuito. Solo cubre errores que se detecten el mismo día.
  Si alguien borra datos un viernes y se descubre el lunes, **ya no se pueden
  recuperar**. Con clientes reales pagando, este margen es muy corto.
- **7 días o más** → plan pago. Margen razonable para un negocio en operación.

Si el valor es de 24 horas, la capa 2 de este documento deja de ser
complementaria y pasa a ser la protección principal.

---

## Capa 2 — Volcado manual

### Requisito único

Instalar las herramientas cliente de PostgreSQL (una sola vez):

- **Windows**: [instalador oficial](https://www.postgresql.org/download/windows/) —
  en el asistente basta con marcar *Command Line Tools*.
- **Mac**: `brew install libpq && brew link --force libpq`
- **Linux**: `sudo apt install postgresql-client`

Comprobar que quedó bien:

```bash
cd backend
npm run db:backup -- --check
```

### Respaldar

```bash
cd backend
npm run db:backup
```

Genera `backups/ventrix-AAAA-MM-DD_HHMM.dump` (carpeta ignorada por git, porque
el repositorio es público y el volcado contiene datos personales).

**El archivo debe copiarse fuera de la máquina** — disco externo o nube
personal. Un respaldo guardado en el mismo computador que se puede dañar,
perder o infectar no cumple su función.

### Frecuencia sugerida

| Situación | Cada cuánto |
|-----------|-------------|
| Operación normal | Semanal |
| Antes de una migración de base de datos | Siempre |
| Antes de un despliegue grande | Siempre |

> Nota técnica: el script usa automáticamente el endpoint **directo** de Neon.
> `pg_dump` no funciona bien contra el endpoint `-pooler` (es PgBouncer en modo
> transacción y produce respaldos incompletos). El script quita ese sufijo solo.

---

## Capa 3 — Simulacro de restauración

**Esta es la capa que nadie hace y la única que demuestra que las otras dos
sirven.** Conviene repetirla cada pocos meses.

### Opción A — Con una rama de Neon (recomendada, no toca producción)

Las ramas de Neon son la forma segura de probar: crean una copia independiente
sin afectar la base real.

1. En la consola de Neon: **Branches → New branch**.
2. Elegir **Create from a past state** y seleccionar una fecha de ayer.
3. Copiar la cadena de conexión de la rama nueva.
4. Verificar que los datos estén completos, por ejemplo:

   ```sql
   SELECT COUNT(*) FROM sales;
   SELECT COUNT(*) FROM products;
   SELECT MAX("createdAt") FROM sales;
   ```

5. Comparar esos números con los de producción. Deben ser coherentes con la
   fecha elegida.
6. Borrar la rama de prueba.

Si el paso 2 no ofrece la fecha buscada, **la ventana de retención es más corta
de lo que se creía**. Mejor descubrirlo en un simulacro que en una emergencia.

### Opción B — Desde un volcado

Restaurar un `.dump` sobre una base vacía (nunca sobre producción):

```bash
pg_restore --no-owner --no-acl -d "<URL_DE_LA_BASE_DE_PRUEBA>" backups/ventrix-....dump
```

Luego correr las mismas consultas de conteo de la opción A.

---

## Si pasa lo peor

1. **No escribir nada en la base afectada.** Cada escritura nueva reduce las
   opciones de recuperación.
2. Poner la aplicación en mantenimiento si el problema es de datos, no de caída.
3. Identificar el momento exacto anterior al daño.
4. Restaurar **a una rama nueva**, nunca encima de la base actual, y verificar
   ahí antes de promoverla.
5. Recién con los datos confirmados, redirigir la aplicación.

El error más común en una emergencia es restaurar directamente sobre la base
dañada y perder también el estado posterior al incidente.
