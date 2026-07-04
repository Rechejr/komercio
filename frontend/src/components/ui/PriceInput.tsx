'use client';

import { forwardRef } from 'react';

function fmt(v: number | string | undefined | null): string {
  if (v === undefined || v === null || v === '') return '';
  const n = typeof v === 'number' ? Math.round(v) : parseInt(String(v).replace(/\D/g, ''), 10);
  if (isNaN(n)) return '';
  return n.toLocaleString('es-CO');
}

interface PriceInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value?: number | string | null;
  onChange?: (value: number | undefined) => void;
}

export const PriceInput = forwardRef<HTMLInputElement, PriceInputProps>(
  function PriceInput({ value, onChange, ...props }, ref) {
    function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
      const digits = e.target.value.replace(/\D/g, '');
      onChange?.(digits ? parseInt(digits, 10) : undefined);
    }

    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        value={fmt(value)}
        onChange={handleChange}
      />
    );
  }
);