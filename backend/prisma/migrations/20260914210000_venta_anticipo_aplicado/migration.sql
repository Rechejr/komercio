-- Cuánto de la factura se cubrió con un anticipo previo. Aparte de paidAmount
-- porque esa plata no entra a la caja el día de la venta: entró cuando se
-- recibió el anticipo.
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "advanceApplied" DECIMAL(65,30) NOT NULL DEFAULT 0;
