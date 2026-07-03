-- Add googleId column for Google OAuth (was in schema but missing migration)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "users_googleId_key" ON "users"("googleId");