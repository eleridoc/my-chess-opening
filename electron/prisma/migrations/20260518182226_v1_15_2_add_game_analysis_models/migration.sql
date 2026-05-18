-- CreateTable
CREATE TABLE "GameAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "engineName" TEXT NOT NULL,
    "engineVersion" TEXT,
    "analysisMode" TEXT NOT NULL,
    "depth" INTEGER,
    "movetimeMs" INTEGER,
    "threads" INTEGER NOT NULL,
    "hashMb" INTEGER NOT NULL,
    "multiPv" INTEGER NOT NULL DEFAULT 1,
    "configSnapshotJson" TEXT NOT NULL,
    "totalPlies" INTEGER NOT NULL DEFAULT 0,
    "analyzedPlies" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "failedAt" DATETIME,
    "cancelledAt" DATETIME,
    "errorMessage" TEXT,
    CONSTRAINT "GameAnalysis_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameMoveAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "gameAnalysisId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "moveNumber" INTEGER NOT NULL,
    "playedBy" TEXT NOT NULL,
    "fenBefore" TEXT NOT NULL,
    "fenAfter" TEXT NOT NULL,
    "positionHashBefore" TEXT,
    "positionHashAfter" TEXT,
    "moveSan" TEXT NOT NULL,
    "moveUci" TEXT,
    "bestMoveUci" TEXT,
    "evalBeforeCp" INTEGER,
    "evalBeforeMate" INTEGER,
    "evalAfterCp" INTEGER,
    "evalAfterMate" INTEGER,
    "depthReached" INTEGER,
    "timeMs" INTEGER,
    "principalVariationUciJson" TEXT,
    CONSTRAINT "GameMoveAnalysis_gameAnalysisId_fkey" FOREIGN KEY ("gameAnalysisId") REFERENCES "GameAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "GameAnalysis_gameId_createdAt_idx" ON "GameAnalysis"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "GameAnalysis_gameId_status_idx" ON "GameAnalysis"("gameId", "status");

-- CreateIndex
CREATE INDEX "GameAnalysis_status_createdAt_idx" ON "GameAnalysis"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GameMoveAnalysis_gameAnalysisId_idx" ON "GameMoveAnalysis"("gameAnalysisId");

-- CreateIndex
CREATE INDEX "GameMoveAnalysis_gameId_ply_idx" ON "GameMoveAnalysis"("gameId", "ply");

-- CreateIndex
CREATE INDEX "GameMoveAnalysis_gameId_idx" ON "GameMoveAnalysis"("gameId");

-- CreateIndex
CREATE INDEX "GameMoveAnalysis_positionHashBefore_idx" ON "GameMoveAnalysis"("positionHashBefore");

-- CreateIndex
CREATE INDEX "GameMoveAnalysis_positionHashAfter_idx" ON "GameMoveAnalysis"("positionHashAfter");

-- CreateIndex
CREATE UNIQUE INDEX "GameMoveAnalysis_gameAnalysisId_ply_key" ON "GameMoveAnalysis"("gameAnalysisId", "ply");
