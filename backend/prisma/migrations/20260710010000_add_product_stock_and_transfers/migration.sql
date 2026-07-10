-- AlterTable
ALTER TABLE "inventory_movements" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "product_stocks" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "fromBranchId" TEXT NOT NULL,
    "toBranchId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_items" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "stock_transfer_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_stocks_branchId_idx" ON "product_stocks"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "product_stocks_productId_branchId_key" ON "product_stocks"("productId", "branchId");

-- CreateIndex
CREATE INDEX "stock_transfers_businessId_idx" ON "stock_transfers"("businessId");

-- CreateIndex
CREATE INDEX "stock_transfers_fromBranchId_idx" ON "stock_transfers"("fromBranchId");

-- CreateIndex
CREATE INDEX "stock_transfers_toBranchId_idx" ON "stock_transfers"("toBranchId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_transferId_idx" ON "stock_transfer_items"("transferId");

-- CreateIndex
CREATE INDEX "stock_transfer_items_productId_idx" ON "stock_transfer_items"("productId");

-- CreateIndex
CREATE INDEX "inventory_movements_branchId_idx" ON "inventory_movements"("branchId");

-- CreateIndex
CREATE INDEX "purchases_branchId_idx" ON "purchases"("branchId");

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_items" ADD CONSTRAINT "stock_transfer_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
