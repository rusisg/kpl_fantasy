-- AlterTable: Add totalPoints to Squad for cumulative points & leaderboard standings
ALTER TABLE "Squad" ADD COLUMN "totalPoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Add purchasePrice to SquadPlayer to lock player cost at acquisition time
ALTER TABLE "SquadPlayer" ADD COLUMN "purchasePrice" DECIMAL(4,1) NOT NULL DEFAULT 0.0;
