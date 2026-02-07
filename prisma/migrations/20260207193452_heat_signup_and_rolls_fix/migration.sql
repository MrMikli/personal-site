/*
  Warnings:

  - You are about to drop the column `description` on the `Gauntlet` table. All the data in the column will be lost.
  - You are about to drop the column `endsAt` on the `Gauntlet` table. All the data in the column will be lost.
  - You are about to drop the column `slug` on the `Gauntlet` table. All the data in the column will be lost.
  - You are about to drop the column `startsAt` on the `Gauntlet` table. All the data in the column will be lost.
  - Added the required column `defaultGameCounter` to the `Heat` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Gauntlet_slug_key";

-- AlterTable
ALTER TABLE "Gauntlet" DROP COLUMN "description",
DROP COLUMN "endsAt",
DROP COLUMN "slug",
DROP COLUMN "startsAt";

-- AlterTable
ALTER TABLE "Heat" ADD COLUMN     "defaultGameCounter" INTEGER NOT NULL,
ALTER COLUMN "startsAt" SET DATA TYPE DATE,
ALTER COLUMN "endsAt" SET DATA TYPE DATE;

-- CreateTable
CREATE TABLE "HeatSignup" (
    "id" TEXT NOT NULL,
    "heatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "selectedGameId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeatSignup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeatRoll" (
    "id" TEXT NOT NULL,
    "heatSignupId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "platformId" TEXT,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HeatRoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_HeatToPlatform" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "HeatSignup_heatId_userId_key" ON "HeatSignup"("heatId", "userId");

-- CreateIndex
CREATE INDEX "HeatRoll_heatSignupId_idx" ON "HeatRoll"("heatSignupId");

-- CreateIndex
CREATE UNIQUE INDEX "HeatRoll_heatSignupId_order_key" ON "HeatRoll"("heatSignupId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "_HeatToPlatform_AB_unique" ON "_HeatToPlatform"("A", "B");

-- CreateIndex
CREATE INDEX "_HeatToPlatform_B_index" ON "_HeatToPlatform"("B");

-- AddForeignKey
ALTER TABLE "HeatSignup" ADD CONSTRAINT "HeatSignup_heatId_fkey" FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatSignup" ADD CONSTRAINT "HeatSignup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatSignup" ADD CONSTRAINT "HeatSignup_selectedGameId_fkey" FOREIGN KEY ("selectedGameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatRoll" ADD CONSTRAINT "HeatRoll_heatSignupId_fkey" FOREIGN KEY ("heatSignupId") REFERENCES "HeatSignup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatRoll" ADD CONSTRAINT "HeatRoll_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatRoll" ADD CONSTRAINT "HeatRoll_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HeatToPlatform" ADD CONSTRAINT "_HeatToPlatform_A_fkey" FOREIGN KEY ("A") REFERENCES "Heat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_HeatToPlatform" ADD CONSTRAINT "_HeatToPlatform_B_fkey" FOREIGN KEY ("B") REFERENCES "Platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;
