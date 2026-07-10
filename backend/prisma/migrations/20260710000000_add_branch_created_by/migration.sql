-- AlterTable
ALTER TABLE "branches" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "branches_createdById_idx" ON "branches"("createdById");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
