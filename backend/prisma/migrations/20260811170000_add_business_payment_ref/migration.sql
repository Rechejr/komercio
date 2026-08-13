-- Referencia del pago (transacción Wompi) con que una vendedora provisionó la
-- cuenta. Único: un mismo pago no puede crear dos cuentas.
ALTER TABLE "businesses" ADD COLUMN "paymentRef" TEXT;
CREATE UNIQUE INDEX "businesses_paymentRef_key" ON "businesses"("paymentRef");
