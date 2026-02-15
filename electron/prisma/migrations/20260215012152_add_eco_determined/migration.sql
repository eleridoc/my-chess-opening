-- AlterTable
ALTER TABLE "Game" ADD COLUMN "ecoDetermined" TEXT;

-- CreateIndex
CREATE INDEX "Game_ecoDetermined_idx" ON "Game"("ecoDetermined");
