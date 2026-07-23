/**
 * Traduce un error de axios a un mensaje que le sirva a quien está usando la
 * aplicación.
 *
 * Los mensajes distinguen tres situaciones que para el usuario son muy
 * distintas: no hay internet, el servidor falló, o el servidor rechazó la
 * operación por una razón concreta. Un genérico "Error" no le dice si debe
 * revisar su conexión, reintentar o corregir algo.
 */

type ApiErrorShape = {
  message?: string;
  code?: string;
  response?: {
    status?: number;
    data?: { error?: string; message?: string };
  };
};

export function getApiErrorMessage(error: unknown, fallback = 'No pudimos cargar los datos'): string {
  const err = error as ApiErrorShape;

  // El backend responde { success:false, error: "..." } — ese texto ya está
  // redactado para el usuario, así que tiene prioridad.
  const fromServer = err?.response?.data?.error || err?.response?.data?.message;
  if (fromServer) return fromServer;

  // Sin objeto response, la petición nunca llegó: no hay red, el servidor está
  // caído o CORS la bloqueó.
  if (!err?.response) {
    return 'Sin conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  }

  const status = err.response.status;
  if (status === 403) return 'No tienes permisos para ver esta información.';
  if (status === 404) return 'No encontramos la información solicitada.';
  if (status === 429) return 'Demasiadas solicitudes. Espera un momento e intenta de nuevo.';
  if (status && status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en unos momentos.';

  return fallback;
}

/** ¿El fallo fue de conectividad y no del servidor? Útil para elegir el ícono. */
export function isNetworkError(error: unknown): boolean {
  return !(error as ApiErrorShape)?.response;
}
