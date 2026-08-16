import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PriceInput } from '../PriceInput';

describe('PriceInput', () => {
  it('muestra el valor inicial con separador de miles', () => {
    render(<PriceInput value={1234567} aria-label="precio" />);
    expect(screen.getByLabelText('precio')).toHaveValue('1.234.567');
  });

  it('está vacío cuando no hay valor', () => {
    const { rerender } = render(<PriceInput value={undefined} aria-label="precio" />);
    expect(screen.getByLabelText('precio')).toHaveValue('');
    rerender(<PriceInput value={null} aria-label="precio" />);
    expect(screen.getByLabelText('precio')).toHaveValue('');
  });

  it('formatea mientras el cajero escribe y reporta el número limpio', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PriceInput value={undefined} onChange={onChange} aria-label="precio" />);

    await user.type(screen.getByLabelText('precio'), '25000');

    expect(screen.getByLabelText('precio')).toHaveValue('25.000');
    expect(onChange).toHaveBeenLastCalledWith(25000);
  });

  it('descarta letras y símbolos que se peguen en el campo', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PriceInput value={undefined} onChange={onChange} aria-label="precio" />);

    await user.click(screen.getByLabelText('precio'));
    await user.paste('$ 19.900 pesos');

    expect(screen.getByLabelText('precio')).toHaveValue('19.900');
    expect(onChange).toHaveBeenLastCalledWith(19900);
  });

  it('reporta undefined (no 0) al borrar todo, para distinguir "vacío" de "gratis"', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    function Wrapper() {
      const [v, setV] = useState<number | undefined>(500);
      return <PriceInput value={v} onChange={(n) => { setV(n); onChange(n); }} aria-label="precio" />;
    }
    render(<Wrapper />);

    await user.clear(screen.getByLabelText('precio'));

    expect(screen.getByLabelText('precio')).toHaveValue('');
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('se actualiza si el formulario cambia el valor desde afuera', () => {
    const { rerender } = render(<PriceInput value={100} aria-label="precio" />);
    rerender(<PriceInput value={98500} aria-label="precio" />);
    expect(screen.getByLabelText('precio')).toHaveValue('98.500');
  });

  it('usa teclado numérico en el celular', () => {
    render(<PriceInput value={0} aria-label="precio" />);
    expect(screen.getByLabelText('precio')).toHaveAttribute('inputMode', 'numeric');
  });
});
