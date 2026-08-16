import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '../ConfirmDialog';

const props = {
  open: true,
  onOpenChange: vi.fn(),
  title: '¿Eliminar este producto?',
  onConfirm: vi.fn(),
};

describe('ConfirmDialog', () => {
  it('no renderiza nada mientras está cerrado', () => {
    render(<ConfirmDialog {...props} open={false} />);
    expect(screen.queryByText('¿Eliminar este producto?')).not.toBeInTheDocument();
  });

  it('muestra título, descripción y los dos botones', () => {
    render(<ConfirmDialog {...props} description="Esta acción no se puede deshacer" />);
    expect(screen.getByText('¿Eliminar este producto?')).toBeInTheDocument();
    expect(screen.getByText('Esta acción no se puede deshacer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('confirma solo cuando se pulsa el botón de confirmar', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<ConfirmDialog {...props} onConfirm={onConfirm} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onConfirm).toHaveBeenCalledTimes(1); // cancelar no confirma
  });

  it('acepta etiquetas propias para la acción', () => {
    render(<ConfirmDialog {...props} confirmLabel="Anular venta" cancelLabel="Volver" />);
    expect(screen.getByRole('button', { name: 'Anular venta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
  });

  it('bloquea los botones mientras la operación está en curso', async () => {
    // pointerEventsCheck: 0 → deja intentar el clic sobre un botón deshabilitado
    // en vez de lanzar error, que es justo lo que se quiere comprobar aquí.
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onConfirm = vi.fn();
    render(<ConfirmDialog {...props} onConfirm={onConfirm} loading />);

    const confirmar = screen.getByRole('button', { name: /Confirmar/ });
    expect(confirmar).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();

    // Evita el doble clic que duplicaría la venta o el borrado.
    await user.click(confirmar);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cierra con la tecla Escape, pero no mientras está cargando', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const { rerender } = render(<ConfirmDialog {...props} onOpenChange={onOpenChange} />);

    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);

    onOpenChange.mockClear();
    rerender(<ConfirmDialog {...props} onOpenChange={onOpenChange} loading />);
    await user.keyboard('{Escape}');
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('es un diálogo accesible (rol y título asociado)', () => {
    render(<ConfirmDialog {...props} />);
    expect(screen.getByRole('dialog', { name: '¿Eliminar este producto?' })).toBeInTheDocument();
  });
});
