-- CreateTable
CREATE TABLE "AccountConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "site" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountConfig_site_username_key" ON "AccountConfig"("site", "username");
