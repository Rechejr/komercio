-- AlterTable
ALTER TABLE "purchase_details" ADD COLUMN "branchId" TEXT;

-- CreateIndex
CREATE INDEX "purchase_details_branchId_idx" ON "purchase_details"("branchId");

-- AddForeignKey
ALTER TABLE "purchase_details" ADD CONSTRAINT "purchase_details_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
