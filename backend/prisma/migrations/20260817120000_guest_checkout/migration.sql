-- Compra sin cuenta: el prospecto paga primero y el webhook crea la cuenta.
-- CreateTable
CREATE TABLE "guest_checkouts" (
    "id" TEXT NOT NULL,
    "paymentLinkId" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerLastName" TEXT NOT NULL,
    "buyerDoc" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "sellerSlug" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "transactionId" TEXT,
    "businessId" TEXT,
    "errorMessage" TEXT,
    "provisionedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_checkouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guest_checkouts_paymentLinkId_key" ON "guest_checkouts"("paymentLinkId");

-- CreateIndex
CREATE UNIQUE INDEX "guest_checkouts_transactionId_key" ON "guest_checkouts"("transactionId");

-- CreateIndex
CREATE INDEX "guest_checkouts_status_idx" ON "guest_checkouts"("status");

-- CreateIndex
CREATE INDEX "guest_checkouts_buyerEmail_idx" ON "guest_checkouts"("buyerEmail");

-- CreateIndex
CREATE INDEX "guest_checkouts_sellerSlug_idx" ON "guest_checkouts"("sellerSlug");
