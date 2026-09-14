import { describe, it, expect } from 'vitest';
import { AxiosError } from 'axios';
import { sesionInvalida } from '../api';

// Cuándo se saca al usuario al login y cuándo no.
//
// De dónde salió esta prueba: la aplicación cerraba la sesión ante CUALQUIER
// fallo al renovarla. Un cliente con mala señal, o el servidor recién
// despertando, terminaba en la pantalla de login con su sesión intacta. Se vio
// primero en las pruebas del CI —máquina cargada, la renovación se pasaba del
// tiempo previsto y el usuario aparecía deslogueado a mitad de la corrida—,
// pero le pasa igual a una persona de verdad en el celular.

// Lo único que mira sesionInvalida es response.status, así que basta con la
// forma real del error; no hace falta fabricar un AxiosError completo.
const conRespuesta = (status: number) => ({ response: { status } });

describe('sesionInvalida', () => {
  it('401: el servidor dijo que la sesión no sirve → al login', () => {
    expect(sesionInvalida(conRespuesta(401))).toBe(true);
  });

  it('403: tampoco sirve → al login', () => {
    expect(sesionInvalida(conRespuesta(403))).toBe(true);
  });

  it('sin respuesta (red caída, servidor frío) → la sesión sigue viva', () => {
    // Esto es lo que rompía sesiones buenas: no hay respuesta que interpretar,
    // así que no hay motivo para creer que la sesión murió.
    expect(sesionInvalida(new AxiosError('Network Error'))).toBe(false);
  });

  it('timeout → la sesión sigue viva', () => {
    const err = new AxiosError('timeout of 8000ms exceeded', 'ECONNABORTED');
    expect(sesionInvalida(err)).toBe(false);
  });

  it('petición cancelada al cambiar de pantalla → la sesión sigue viva', () => {
    const err = new AxiosError('canceled', 'ERR_CANCELED');
    expect(sesionInvalida(err)).toBe(false);
  });

  it('500 del servidor → es un error de ellos, no una sesión vencida', () => {
    expect(sesionInvalida(conRespuesta(500))).toBe(false);
  });

  it('502/503 (servidor reiniciándose) → no desloguea', () => {
    expect(sesionInvalida(conRespuesta(502))).toBe(false);
    expect(sesionInvalida(conRespuesta(503))).toBe(false);
  });

  it('un error cualquiera que no es de axios no desloguea', () => {
    expect(sesionInvalida(new Error('vaya'))).toBe(false);
    expect(sesionInvalida(undefined)).toBe(false);
    expect(sesionInvalida(null)).toBe(false);
  });
});
