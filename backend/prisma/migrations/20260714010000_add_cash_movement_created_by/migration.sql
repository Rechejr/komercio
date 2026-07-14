-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "cash_movements_createdById_idx" ON "cash_movements"("createdById");

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
