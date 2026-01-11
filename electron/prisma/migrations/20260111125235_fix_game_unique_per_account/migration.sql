/*
  Warnings:

  - A unique constraint covering the columns `[accountConfigId,site,externalId]` on the table `Game` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Game_site_externalId_key";

-- CreateIndex
CREATE INDEX "Game_site_externalId_idx" ON "Game"("site", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_accountConfigId_site_externalId_key" ON "Game"("accountConfigId", "site", "externalId");
