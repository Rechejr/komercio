-- La factura de un fiado o de una cuenta por pagar IMPORTADOS no tenía dónde
-- vivir: se guardaba dentro de las notas como el texto "Factura FC-105", y la
-- columna Factura del listado —que muestra la de la venta o la compra— salía
-- vacía en todo lo importado.

ALTER TABLE "credits" ADD COLUMN "invoiceNumber" TEXT;
ALTER TABLE "supplier_credits" ADD COLUMN "invoiceNumber" TEXT;

-- Recupera las que ya se importaron: saca el número del texto de las notas y lo
-- deja en su columna. Solo toca las filas que empiezan por "Factura ", que es
-- exactamente el formato que escribía el importador; el resto queda intacto.
UPDATE "credits"
   SET "invoiceNumber" = substring(notes from '^Factura ([^ ]+)')
 WHERE notes LIKE 'Factura %'
   AND "invoiceNumber" IS NULL;

UPDATE "supplier_credits"
   SET "invoiceNumber" = substring(notes from '^Factura ([^ ]+)')
 WHERE notes LIKE 'Factura %'
   AND "invoiceNumber" IS NULL;
