-- Medios de pago configurables (PaymentAccount). Migración puramente ADITIVA:
-- nuevo enum, nueva tabla, columnas FK nullable e índices. No toca nada existente,
-- así que se aplica limpio tanto en dev (Neon) como en prod (Railway).

-- CreateEnum
CREATE TYPE "PaymentAccountType" AS ENUM ('CASH', 'BANK', 'OTHER');

-- CreateTable
CREATE TABLE "payment_accounts" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentAccountType" NOT NULL DEFAULT 'OTHER',
    "legacyEnum" "PaymentMethod",
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_accounts_businessId_idx" ON "payment_accounts"("businessId");

-- AlterTable
ALTER TABLE "sales" ADD COLUMN "paymentAccountId" TEXT;
ALTER TABLE "purchases" ADD COLUMN "paymentAccountId" TEXT;
ALTER TABLE "expenses" ADD COLUMN "paymentAccountId" TEXT;
ALTER TABLE "credit_payments" ADD COLUMN "paymentAccountId" TEXT;

-- CreateIndex
CREATE INDEX "sales_paymentAccountId_idx" ON "sales"("paymentAccountId");
CREATE INDEX "purchases_paymentAccountId_idx" ON "purchases"("paymentAccountId");
CREATE INDEX "expenses_paymentAccountId_idx" ON "expenses"("paymentAccountId");
CREATE INDEX "credit_payments_paymentAccountId_idx" ON "credit_payments"("paymentAccountId");

-- AddForeignKey
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "sales_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "credit_payments" ADD CONSTRAINT "credit_payments_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "payment_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
