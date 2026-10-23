-- AlterTable: Add favoriteClubId to User (reconciling schema drift)
ALTER TABLE "User" ADD COLUMN "favoriteClubId" TEXT;

-- AlterTable: Add externalId to Player for deterministic roster sync
ALTER TABLE "Player" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE INDEX "User_favoriteClubId_idx" ON "User"("favoriteClubId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_externalId_key" ON "Player"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_clubId_firstName_lastName_key" ON "Player"("clubId", "firstName", "lastName");

-- CreateIndex
CREATE UNIQUE INDEX "SquadPlayer_squadId_positionOrder_key" ON "SquadPlayer"("squadId", "positionOrder");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_favoriteClubId_fkey" FOREIGN KEY ("favoriteClubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
