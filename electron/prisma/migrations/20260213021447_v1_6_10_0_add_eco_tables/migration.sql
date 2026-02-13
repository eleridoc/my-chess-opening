-- CreateTable
CREATE TABLE "EcoOpening" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "eco" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pgn" TEXT,
    "uci" TEXT,
    "epd" TEXT,
    "signature" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "EcoDatasetMeta" (
    "source" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "sourceUrl" TEXT,
    "sourceVersion" TEXT,
    "seededAt" DATETIME,
    "lastUpdatedAt" DATETIME,
    "openingsCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE UNIQUE INDEX "EcoOpening_signature_key" ON "EcoOpening"("signature");

-- CreateIndex
CREATE INDEX "EcoOpening_eco_idx" ON "EcoOpening"("eco");

-- CreateIndex
CREATE INDEX "EcoOpening_source_eco_idx" ON "EcoOpening"("source", "eco");

-- CreateIndex
CREATE INDEX "EcoOpening_source_idx" ON "EcoOpening"("source");
