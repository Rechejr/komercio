-- Compras: pago dividido + crédito a proveedor (Cuentas por pagar).

-- 1. Deuda con proveedores.
ALTER TABLE "suppliers" ADD COLUMN "currentDebt" DECIMAL(65,30) NOT NULL DEFAULT 0;
CREATE INDEX "suppliers_businessId_currentDebt_idx" ON "suppliers"("businessId", "currentDebt");

-- 2. Pago dividido en la compra. Backfill: las compras existentes se dan por
--    pagadas completas (paidAmount = total).
ALTER TABLE "purchases" ADD COLUMN "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "purchases" ADD COLUMN "paymentDetails" JSONB;
UPDATE "purchases" SET "paidAmount" = "total";

-- 3. Crédito a proveedor.
CREATE TABLE "supplier_credits" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT,
    "supplierId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "balance" DECIMAL(65,30) NOT NULL,
    "status" "CreditStatus" NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "supplier_credits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_credit_payments" (
    "id" TEXT NOT NULL,
    "supplierCreditId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentAccountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_credit_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "supplier_credits_purchaseId_key" ON "supplier_credits"("purchaseId");
CREATE INDEX "supplier_credits_supplierId_idx" ON "supplier_credits"("supplierId");
CREATE INDEX "supplier_credits_businessId_idx" ON "supplier_credits"("businessId");
CREATE INDEX "supplier_credits_businessId_status_idx" ON "supplier_credits"("businessId", "status");
CREATE INDEX "supplier_credit_payments_supplierCreditId_idx" ON "supplier_credit_payments"("supplierCreditId");
CREATE INDEX "supplier_credit_payments_paymentAccountId_idx" ON "supplier_credit_payments"("paymentAccountId");

ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_payments" ADD CONSTRAINT "supplier_credit_payments_supplierCreditId_fkey" FOREIGN KEY ("supplierCreditId") REFERENCES "supplier_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_credit_payments" ADD CONSTRAINT "supplier_credit_payments_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
