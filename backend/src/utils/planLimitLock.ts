import { Prisma } from '@prisma/client';

/**
 * Serializa el chequeo de un límite de plan (productos, clientes, usuarios,
 * ventas/mes) contra creaciones concurrentes del mismo negocio.
 *
 * El middleware `planLimit.*()` hace un `count()` de "buena fe" antes de la
 * transacción real — sirve para rechazar rápido en el caso normal, pero no es
 * atómico: dos peticiones que lleguen casi al mismo tiempo pueden leer el
 * mismo conteo (ej. 49 de 50) y ambas pasar, dejando al negocio con más
 * registros de los que su plan permite.
 *
 * `pg_advisory_xact_lock` serializa por el resto de la transacción actual —
 * la segunda petición concurrente espera a que la primera confirme (o
 * revierta) antes de tomar su propio conteo, así que el recuento que hace el
 * llamador inmediatamente después de este lock sí es confiable.
 */
export async function acquirePlanLimitLock(
  tx: Prisma.TransactionClient,
  businessId: string,
  resource: string,
): Promise<void> {
  // pg_advisory_xact_lock devuelve `void` — $queryRaw intenta deserializar el
  // tipo de cada columna del resultado y truena con ese tipo ("Failed to
  // deserialize column of type 'void'"). $executeRaw no intenta mapear filas
  // (solo informa cuántas afectó), así que es la forma correcta de llamarla.
  await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `${businessId}:${resource}`);
}
