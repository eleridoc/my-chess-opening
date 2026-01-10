-- CreateTable
CREATE TABLE "Game" (
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
    "pgn" TEXT NOT NULL,
    "pgnHash" TEXT,
    CONSTRAINT "Game_accountConfigId_fkey" FOREIGN KEY ("accountConfigId") REFERENCES "AccountConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GamePlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "gameId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "elo" INTEGER,
    "ratingDiff" INTEGER,
    CONSTRAINT "GamePlayer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameMove" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "gameId" TEXT NOT NULL,
    "ply" INTEGER NOT NULL,
    "san" TEXT NOT NULL,
    "clockMs" INTEGER,
    CONSTRAINT "GameMove_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportRun" (
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
    CONSTRAINT "ImportRun_accountConfigId_fkey" FOREIGN KEY ("accountConfigId") REFERENCES "AccountConfig" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Game_accountConfigId_playedAt_idx" ON "Game"("accountConfigId", "playedAt");

-- CreateIndex
CREATE INDEX "Game_playedAt_idx" ON "Game"("playedAt");

-- CreateIndex
CREATE INDEX "Game_eco_idx" ON "Game"("eco");

-- CreateIndex
CREATE UNIQUE INDEX "Game_site_externalId_key" ON "Game"("site", "externalId");

-- CreateIndex
CREATE INDEX "GamePlayer_username_idx" ON "GamePlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX "GamePlayer_gameId_color_key" ON "GamePlayer"("gameId", "color");

-- CreateIndex
CREATE UNIQUE INDEX "GameMove_gameId_ply_key" ON "GameMove"("gameId", "ply");

-- CreateIndex
CREATE INDEX "ImportRun_accountConfigId_startedAt_idx" ON "ImportRun"("accountConfigId", "startedAt");
