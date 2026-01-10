/*
  Warnings:

  - Added the required column `fen` to the `GameMove` table without a default value. This is not possible if the table is not empty.
  - Added the required column `positionHash` to the `GameMove` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "clockMs" INTEGER,
    CONSTRAINT "GameMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameMove" ("clockMs", "createdAt", "gameId", "id", "ply", "san", "updatedAt") SELECT "clockMs", "createdAt", "gameId", "id", "ply", "san", "updatedAt" FROM "GameMove";
DROP TABLE "GameMove";
ALTER TABLE "new_GameMove" RENAME TO "GameMove";
CREATE INDEX "GameMove_positionHash_idx" ON "GameMove"("positionHash");
CREATE INDEX "GameMove_gameId_positionHash_idx" ON "GameMove"("gameId", "positionHash");
CREATE UNIQUE INDEX "GameMove_gameId_ply_key" ON "GameMove"("gameId", "ply");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
