-- CreateEnum
CREATE TYPE "IgdbTagKind" AS ENUM ('GENRE', 'THEME', 'KEYWORD', 'GAME_MODE', 'PERSPECTIVE', 'COLLECTION', 'FRANCHISE', 'COMPANY', 'LANGUAGE');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "aggregatedRating" DOUBLE PRECISION,
ADD COLUMN     "aggregatedRatingCount" INTEGER,
ADD COLUMN     "collectionIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "developerIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "franchiseIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "gameModeIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "genreIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "hasEnglish" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "igdbData" JSONB,
ADD COLUMN     "igdbSyncedAt" TIMESTAMP(3),
ADD COLUMN     "keywordIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "languageIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "perspectiveIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "popPlayed" DOUBLE PRECISION,
ADD COLUMN     "popPlaying" DOUBLE PRECISION,
ADD COLUMN     "popVisits" DOUBLE PRECISION,
ADD COLUMN     "popWantToPlay" DOUBLE PRECISION,
ADD COLUMN     "popularitySyncedAt" TIMESTAMP(3),
ADD COLUMN     "porterIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "publisherIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "ratingCount" INTEGER,
ADD COLUMN     "themeIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "totalRating" DOUBLE PRECISION,
ADD COLUMN     "totalRatingCount" INTEGER,
ADD COLUMN     "url" TEXT;

-- AlterTable
ALTER TABLE "GamePlatform" ADD COLUMN     "releaseDateUnix" INTEGER,
ADD COLUMN     "releaseRegionIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "releaseYear" INTEGER;

-- CreateTable
CREATE TABLE "IgdbTag" (
    "id" TEXT NOT NULL,
    "kind" "IgdbTagKind" NOT NULL,
    "igdbId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IgdbTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IgdbTag_kind_name_idx" ON "IgdbTag"("kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "IgdbTag_kind_igdbId_key" ON "IgdbTag"("kind", "igdbId");

-- CreateIndex
CREATE INDEX "Game_genreIds_idx" ON "Game" USING GIN ("genreIds");

-- CreateIndex
CREATE INDEX "Game_themeIds_idx" ON "Game" USING GIN ("themeIds");

-- CreateIndex
CREATE INDEX "Game_keywordIds_idx" ON "Game" USING GIN ("keywordIds");

-- CreateIndex
CREATE INDEX "Game_collectionIds_idx" ON "Game" USING GIN ("collectionIds");

-- CreateIndex
CREATE INDEX "Game_franchiseIds_idx" ON "Game" USING GIN ("franchiseIds");

-- CreateIndex
CREATE INDEX "Game_developerIds_idx" ON "Game" USING GIN ("developerIds");

-- CreateIndex
CREATE INDEX "Game_publisherIds_idx" ON "Game" USING GIN ("publisherIds");

-- CreateIndex
CREATE INDEX "Game_totalRatingCount_idx" ON "Game"("totalRatingCount");

-- CreateIndex
CREATE INDEX "Game_popPlayed_idx" ON "Game"("popPlayed");
