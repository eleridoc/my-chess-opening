/*
  Warnings:

  - Added the required column `blackUsername` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `myColor` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `myUsername` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `opponentUsername` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `whiteUsername` to the `Game` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Game" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accountConfigId" TEXT NOT NULL,
    "site" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "siteUrl" TEXT,
    "playedAt" DATETIME NOT NULL,
    "rated" BOOLEAN NOT NULL,
    "variant" TEXT NOT NULL,
    "speed" TEXT NOT NULL,
    "timeControl" TEXT NOT NULL,
    "initialSeconds" INTEGER NOT NULL,
    "incrementSeconds" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "termination" TEXT,
    "eco" TEXT,
    "opening" TEXT,
    "resultKey" INTEGER NOT NULL,
    "pgn" TEXT NOT NULL,
    "pgnHash" TEXT,
    "whiteUsername" TEXT NOT NULL,
    "blackUsername" TEXT NOT NULL,
    "whiteElo" INTEGER,
    "blackElo" INTEGER,
    "whiteRatingDiff" INTEGER,
    "blackRatingDiff" INTEGER,
    "myColor" TEXT NOT NULL,
    "myUsername" TEXT NOT NULL,
    "opponentUsername" TEXT NOT NULL,
    "myElo" INTEGER,
    "opponentElo" INTEGER,
    "myRatingDiff" INTEGER,
    "opponentRatingDiff" INTEGER,
    CONSTRAINT "Game_accountConfigId_fkey" FOREIGN KEY ("accountConfigId") REFERENCES "AccountConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("accountConfigId", "createdAt", "eco", "externalId", "id", "incrementSeconds", "initialSeconds", "opening", "pgn", "pgnHash", "playedAt", "rated", "result", "resultKey", "site", "siteUrl", "speed", "termination", "timeControl", "updatedAt", "variant") SELECT "accountConfigId", "createdAt", "eco", "externalId", "id", "incrementSeconds", "initialSeconds", "opening", "pgn", "pgnHash", "playedAt", "rated", "result", "resultKey", "site", "siteUrl", "speed", "termination", "timeControl", "updatedAt", "variant" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE INDEX "Game_accountConfigId_playedAt_idx" ON "Game"("accountConfigId", "playedAt");
CREATE INDEX "Game_accountConfigId_myColor_idx" ON "Game"("accountConfigId", "myColor");
CREATE INDEX "Game_playedAt_idx" ON "Game"("playedAt");
CREATE INDEX "Game_eco_idx" ON "Game"("eco");
CREATE INDEX "Game_resultKey_idx" ON "Game"("resultKey");
CREATE UNIQUE INDEX "Game_site_externalId_key" ON "Game"("site", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
