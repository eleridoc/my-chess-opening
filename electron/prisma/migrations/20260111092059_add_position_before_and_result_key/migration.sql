/*
  Warnings:

  - Added the required column `resultKey` to the `Game` table without a default value. This is not possible if the table is not empty.
  - Added the required column `positionHashBefore` to the `GameMove` table without a default value. This is not possible if the table is not empty.

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
    CONSTRAINT "Game_accountConfigId_fkey" FOREIGN KEY ("accountConfigId") REFERENCES "AccountConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Game" ("accountConfigId", "createdAt", "eco", "externalId", "id", "incrementSeconds", "initialSeconds", "opening", "pgn", "pgnHash", "playedAt", "rated", "result", "site", "siteUrl", "speed", "termination", "timeControl", "updatedAt", "variant") SELECT "accountConfigId", "createdAt", "eco", "externalId", "id", "incrementSeconds", "initialSeconds", "opening", "pgn", "pgnHash", "playedAt", "rated", "result", "site", "siteUrl", "speed", "termination", "timeControl", "updatedAt", "variant" FROM "Game";
DROP TABLE "Game";
ALTER TABLE "new_Game" RENAME TO "Game";
CREATE INDEX "Game_accountConfigId_playedAt_idx" ON "Game"("accountConfigId", "playedAt");
CREATE INDEX "Game_playedAt_idx" ON "Game"("playedAt");
CREATE INDEX "Game_eco_idx" ON "Game"("eco");
CREATE INDEX "Game_resultKey_idx" ON "Game"("resultKey");
CREATE UNIQUE INDEX "Game_site_externalId_key" ON "Game"("site", "externalId");
CREATE TABLE "new_GameMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "gameId" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "san" TEXT NOT NULL,
    "uci" TEXT,
    "fen" TEXT NOT NULL,
    "positionHash" TEXT NOT NULL,
    "positionHashBefore" TEXT NOT NULL,
    "fenBefore" TEXT,
    "clockMs" INTEGER,
    CONSTRAINT "GameMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameMove" ("clockMs", "createdAt", "fen", "gameId", "id", "ply", "positionHash", "san", "uci", "updatedAt") SELECT "clockMs", "createdAt", "fen", "gameId", "id", "ply", "positionHash", "san", "uci", "updatedAt" FROM "GameMove";
DROP TABLE "GameMove";
ALTER TABLE "new_GameMove" RENAME TO "GameMove";
CREATE INDEX "GameMove_positionHash_idx" ON "GameMove"("positionHash");
CREATE INDEX "GameMove_gameId_positionHash_idx" ON "GameMove"("gameId", "positionHash");
CREATE INDEX "GameMove_positionHashBefore_idx" ON "GameMove"("positionHashBefore");
CREATE INDEX "GameMove_positionHashBefore_uci_idx" ON "GameMove"("positionHashBefore", "uci");
CREATE UNIQUE INDEX "GameMove_gameId_ply_key" ON "GameMove"("gameId", "ply");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
