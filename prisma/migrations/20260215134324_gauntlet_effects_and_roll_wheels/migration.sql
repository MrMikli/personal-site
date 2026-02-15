-- CreateEnum
CREATE TYPE "EffectKind" AS ENUM ('PUNISH_ROLL_POOL_MINUS_30', 'REWARD_ROLL_POOL_PLUS_30', 'REWARD_BONUS_ROLL_PLATFORM', 'REWARD_MOVE_WHEEL', 'REWARD_VETO_REROLL');

-- CreateEnum
CREATE TYPE "HeatRollSource" AS ENUM ('NORMAL', 'BONUS');

-- AlterTable
ALTER TABLE "HeatRoll" ADD COLUMN     "bonusHeatEffectId" TEXT,
ADD COLUMN     "source" "HeatRollSource" NOT NULL DEFAULT 'NORMAL';

-- CreateTable
CREATE TABLE "GauntletEffect" (
    "id" TEXT NOT NULL,
    "gauntletId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EffectKind" NOT NULL,
    "remainingUses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GauntletEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeatEffect" (
    "id" TEXT NOT NULL,
    "heatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "EffectKind" NOT NULL,
    "poolDelta" INTEGER,
    "platformId" TEXT,
    "remainingUses" INTEGER NOT NULL DEFAULT 1,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeatEffect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HeatRollWheel" (
    "id" TEXT NOT NULL,
    "heatRollId" TEXT NOT NULL,
    "chosenIndex" INTEGER NOT NULL,
    "gameIds" JSONB NOT NULL,
    "platformIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HeatRollWheel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GauntletEffect_userId_idx" ON "GauntletEffect"("userId");

-- CreateIndex
CREATE INDEX "GauntletEffect_gauntletId_idx" ON "GauntletEffect"("gauntletId");

-- CreateIndex
CREATE UNIQUE INDEX "GauntletEffect_gauntletId_userId_kind_key" ON "GauntletEffect"("gauntletId", "userId", "kind");

-- CreateIndex
CREATE INDEX "HeatEffect_heatId_userId_idx" ON "HeatEffect"("heatId", "userId");

-- CreateIndex
CREATE INDEX "HeatEffect_userId_kind_idx" ON "HeatEffect"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "HeatRollWheel_heatRollId_key" ON "HeatRollWheel"("heatRollId");

-- CreateIndex
CREATE INDEX "HeatRollWheel_heatRollId_idx" ON "HeatRollWheel"("heatRollId");

-- AddForeignKey
ALTER TABLE "GauntletEffect" ADD CONSTRAINT "GauntletEffect_gauntletId_fkey" FOREIGN KEY ("gauntletId") REFERENCES "Gauntlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GauntletEffect" ADD CONSTRAINT "GauntletEffect_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatEffect" ADD CONSTRAINT "HeatEffect_heatId_fkey" FOREIGN KEY ("heatId") REFERENCES "Heat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatEffect" ADD CONSTRAINT "HeatEffect_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatEffect" ADD CONSTRAINT "HeatEffect_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "Platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatRoll" ADD CONSTRAINT "HeatRoll_bonusHeatEffectId_fkey" FOREIGN KEY ("bonusHeatEffectId") REFERENCES "HeatEffect"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HeatRollWheel" ADD CONSTRAINT "HeatRollWheel_heatRollId_fkey" FOREIGN KEY ("heatRollId") REFERENCES "HeatRoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
