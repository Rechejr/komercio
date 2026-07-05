-- Add legalName and mobile columns to suppliers table
-- These fields were in schema.prisma but missing from the initial migration

ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "suppliers" ADD COLUMN IF NOT EXISTS "mobile" TEXT;