-- AlterTable
ALTER TABLE "Platform" ADD COLUMN     "parentPlatformId" TEXT,
ADD COLUMN     "yearEnd" INTEGER,
ADD COLUMN     "yearStart" INTEGER,
ALTER COLUMN "igdbId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Platform_parentPlatformId_idx" ON "Platform"("parentPlatformId");

-- AddForeignKey
ALTER TABLE "Platform" ADD CONSTRAINT "Platform_parentPlatformId_fkey" FOREIGN KEY ("parentPlatformId") REFERENCES "Platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
