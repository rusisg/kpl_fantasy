-- AlterTable
ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "clubId" TEXT;
ALTER TABLE "League" ALTER COLUMN "createdById" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "League_slug_key" ON "League"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "League_clubId_key" ON "League"("clubId");
CREATE INDEX IF NOT EXISTS "League_slug_idx" ON "League"("slug");
CREATE INDEX IF NOT EXISTS "League_isSystem_idx" ON "League"("isSystem");

-- UpdateForeignKeys
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'League_clubId_fkey'
    ) THEN
        ALTER TABLE "League" ADD CONSTRAINT "League_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'League_createdById_fkey'
    ) THEN
        ALTER TABLE "League" DROP CONSTRAINT "League_createdById_fkey";
    END IF;
    ALTER TABLE "League" ADD CONSTRAINT "League_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'User_favoriteClubId_fkey'
    ) THEN
        ALTER TABLE "User" DROP CONSTRAINT "User_favoriteClubId_fkey";
    END IF;
    ALTER TABLE "User" ADD CONSTRAINT "User_favoriteClubId_fkey" FOREIGN KEY ("favoriteClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
END $$;
