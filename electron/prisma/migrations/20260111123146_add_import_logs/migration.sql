-- CreateTable
CREATE TABLE "ImportLogEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "scope" TEXT,
    "site" TEXT,
    "username" TEXT,
    "externalId" TEXT,
    "url" TEXT,
    "data" TEXT,
    CONSTRAINT "ImportLogEntry_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "ImportRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ImportRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "accountConfigId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorMessage" TEXT,
    "gamesFound" INTEGER NOT NULL DEFAULT 0,
    "gamesInserted" INTEGER NOT NULL DEFAULT 0,
    "gamesSkipped" INTEGER NOT NULL DEFAULT 0,
    "gamesFailed" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ImportRun_accountConfigId_fkey" FOREIGN KEY ("accountConfigId") REFERENCES "AccountConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ImportRun" ("accountConfigId", "createdAt", "errorMessage", "finishedAt", "gamesFound", "gamesInserted", "gamesSkipped", "id", "startedAt", "status", "updatedAt") SELECT "accountConfigId", "createdAt", "errorMessage", "finishedAt", "gamesFound", "gamesInserted", "gamesSkipped", "id", "startedAt", "status", "updatedAt" FROM "ImportRun";
DROP TABLE "ImportRun";
ALTER TABLE "new_ImportRun" RENAME TO "ImportRun";
CREATE INDEX "ImportRun_accountConfigId_startedAt_idx" ON "ImportRun"("accountConfigId", "startedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ImportLogEntry_importRunId_createdAt_idx" ON "ImportLogEntry"("importRunId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportLogEntry_level_createdAt_idx" ON "ImportLogEntry"("level", "createdAt");
