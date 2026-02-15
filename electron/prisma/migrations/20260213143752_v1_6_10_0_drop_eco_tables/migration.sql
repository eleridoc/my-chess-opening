/*
  Warnings:

  - You are about to drop the `EcoDatasetMeta` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `EcoOpening` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "EcoDatasetMeta";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "EcoOpening";
PRAGMA foreign_keys=on;
