-- Pagos de suscripción cobrados por fuera de Wompi (efectivo, transferencia,
-- Nequi). Antes solo existían los payment_links de la pasarela, así que una
-- venta en efectivo no sumaba en los ingresos del panel de superadmin.

CREATE TABLE "manual_payments" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "period" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manual_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "manual_payments_businessId_idx" ON "manual_payments"("businessId");
CREATE INDEX "manual_payments_paidAt_idx" ON "manual_payments"("paidAt");

ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_businessId_fkey"
    FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
