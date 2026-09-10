-- Addi y Sistecrédito: plataformas de financiación al cliente. La venta se
-- cierra hoy pero la plata la gira la plataforma después, así que no es efectivo
-- (no entra a la caja) ni una cuenta bancaria propia.

ALTER TYPE "PaymentAccountType" ADD VALUE IF NOT EXISTS 'FINANCING';
