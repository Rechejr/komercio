-- CreateTable
CREATE TABLE "ai_weekly_summaries" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_weekly_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_weekly_summaries_businessId_createdAt_idx" ON "ai_weekly_summaries"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "ai_weekly_summaries" ADD CONSTRAINT "ai_weekly_summaries_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
