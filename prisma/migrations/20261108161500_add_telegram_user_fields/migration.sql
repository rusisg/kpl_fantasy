-- AlterTable
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "telegramId" TEXT,
  ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramId_key" ON "User"("telegramId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "User_telegramId_idx" ON "User"("telegramId");
