-- Cuánto de la compra se cubrió con un anticipo girado antes al proveedor.
-- Aparte de paidAmount porque esa plata no sale de la caja el día de la compra:
-- salió cuando se giró el anticipo. Espejo de sales.advanceApplied.
ALTER TABLE "purchases" ADD COLUMN IF NOT EXISTS "advanceApplied" DECIMAL(65,30) NOT NULL DEFAULT 0;
