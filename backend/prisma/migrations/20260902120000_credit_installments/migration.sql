-- Venta a cuotas (fiado a plazos).
--
-- El valor de cada cuota lo define el vendedor (no se reparte solo): en muebles
-- es comun una primera mas alta o redondear la ultima. Vencen mensualmente.
--
-- El interes es de FINANCIACION: se cobra por dar el plazo, se suma al saldo
-- desde el principio y queda repartido en las cuotas, asi el cliente sabe desde
-- el primer dia cuanto va a pagar en total. No es un recargo por atraso.
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PARTIAL', 'PAID');

CREATE TABLE "credit_installments" (
    "id"         TEXT NOT NULL,
    "creditId"   TEXT NOT NULL,
    "numero"     INTEGER NOT NULL,
    "monto"      DECIMAL(65,30) NOT NULL,
    "dueDate"    DATE NOT NULL,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status"     "InstallmentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "credit_installments_pkey" PRIMARY KEY ("id")
);

-- Dos cuotas no pueden compartir numero dentro del mismo fiado.
CREATE UNIQUE INDEX "credit_installments_creditId_numero_key" ON "credit_installments"("creditId", "numero");
CREATE INDEX "credit_installments_creditId_idx" ON "credit_installments"("creditId");
CREATE INDEX "credit_installments_dueDate_idx" ON "credit_installments"("dueDate");

ALTER TABLE "credit_installments" ADD CONSTRAINT "credit_installments_creditId_fkey"
  FOREIGN KEY ("creditId") REFERENCES "credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Datos de la financiacion en el fiado. Null en los fiados normales (sin cuotas),
-- que siguen funcionando exactamente igual que antes.
ALTER TABLE "credits" ADD COLUMN "interestRate"    DECIMAL(65,30);
ALTER TABLE "credits" ADD COLUMN "interestAmount"  DECIMAL(65,30);
ALTER TABLE "credits" ADD COLUMN "principalAmount" DECIMAL(65,30);

-- A que cuota se aplico cada abono: lo elige el cliente al pagar.
ALTER TABLE "credit_payments" ADD COLUMN "installmentId" TEXT;
CREATE INDEX "credit_payments_installmentId_idx" ON "credit_payments"("installmentId");
ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_installmentId_fkey"
  FOREIGN KEY ("installmentId") REFERENCES "credit_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
