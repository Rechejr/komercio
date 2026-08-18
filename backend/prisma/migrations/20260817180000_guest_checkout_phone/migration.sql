-- Celular del comprador: sin él la vendedora no puede avisarle que revise el
-- correo (que se va a spam con frecuencia). Las compras que ya existan quedan
-- con '' y se completan a mano si hiciera falta.
ALTER TABLE "guest_checkouts" ADD COLUMN "buyerPhone" TEXT NOT NULL DEFAULT '';
