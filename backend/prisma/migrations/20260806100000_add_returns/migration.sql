-- Devoluciones / notas crédito de ventas.
CREATE TABLE "returns" (
    "id" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerId" TEXT,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "refundMethod" TEXT NOT NULL DEFAULT 'NONE',
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "return_details" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "saleDetailId" TEXT,
    "productId" TEXT NOT NULL,
    "productVariantId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_details_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "returns_branchId_returnNumber_key" ON "returns"("branchId", "returnNumber");
CREATE INDEX "returns_saleId_idx" ON "returns"("saleId");
CREATE INDEX "returns_branchId_idx" ON "returns"("branchId");
CREATE INDEX "returns_createdAt_idx" ON "returns"("createdAt");
CREATE INDEX "return_details_returnId_idx" ON "return_details"("returnId");
CREATE INDEX "return_details_productId_idx" ON "return_details"("productId");

ALTER TABLE "returns" ADD CONSTRAINT "returns_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "return_details" ADD CONSTRAINT "return_details_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
