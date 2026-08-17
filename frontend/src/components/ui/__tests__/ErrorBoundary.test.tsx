import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import * as Sentry from '@sentry/nextjs';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

// React imprime el error en consola aunque el boundary lo capture: se silencia
// para que la salida de las pruebas siga siendo legible.
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

function Explota({ falla }: { falla: boolean }): JSX.Element {
  if (falla) throw new Error('columna undefined en el reporte');
  return <p>Reporte de ventas</p>;
}

describe('ErrorBoundary', () => {
  it('muestra el contenido cuando no hay error', () => {
    render(<ErrorBoundary><p>Reporte de ventas</p></ErrorBoundary>);
    expect(screen.getByText('Reporte de ventas')).toBeInTheDocument();
  });

  it('atrapa el error y muestra una pantalla entendible en vez de una en blanco', () => {
    render(<ErrorBoundary><Explota falla /></ErrorBoundary>);
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reintentar/ })).toBeInTheDocument();
  });

  it('no le muestra al usuario el detalle técnico del error', () => {
    render(<ErrorBoundary><Explota falla /></ErrorBoundary>);
    // En producción el mensaje interno no se pinta (solo en desarrollo).
    const detalleVisible = screen.queryByText(/columna undefined/);
    if (process.env.NODE_ENV === 'development') {
      expect(detalleVisible).toBeInTheDocument();
    } else {
      expect(detalleVisible).not.toBeInTheDocument();
    }
  });

  it('reporta el error a Sentry con el componente donde ocurrió', () => {
    render(<ErrorBoundary><Explota falla /></ErrorBoundary>);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'columna undefined en el reporte' }),
      expect.objectContaining({ extra: expect.objectContaining({ componentStack: expect.anything() }) }),
    );
  });

  it('"Reintentar" vuelve a mostrar la sección si el error ya se resolvió', async () => {
    const user = userEvent.setup();

    function Contenedor() {
      const [falla, setFalla] = useState(true);
      return (
        <>
          <button onClick={() => setFalla(false)}>arreglar</button>
          <ErrorBoundary><Explota falla={falla} /></ErrorBoundary>
        </>
      );
    }
    render(<Contenedor />);
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'arreglar' }));
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));

    expect(screen.getByText('Reporte de ventas')).toBeInTheDocument();
    expect(screen.queryByText('Algo salió mal')).not.toBeInTheDocument();
  });

  it('aísla el fallo: lo que está fuera del boundary sigue en pie', () => {
    render(
      <div>
        <nav>Menú lateral</nav>
        <ErrorBoundary><Explota falla /></ErrorBoundary>
      </div>,
    );
    expect(screen.getByText('Menú lateral')).toBeInTheDocument();
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();
  });
});
