-- CreateTable
CREATE TABLE "Gauntlet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "description" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gauntlet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Heat" (
    "id" TEXT NOT NULL,
    "gauntletId" TEXT NOT NULL,
    "name" TEXT,
    "order" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Heat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GauntletToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Gauntlet_slug_key" ON "Gauntlet"("slug");

-- CreateIndex
CREATE INDEX "Gauntlet_name_idx" ON "Gauntlet"("name");

-- CreateIndex
CREATE INDEX "Heat_gauntletId_order_idx" ON "Heat"("gauntletId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "_GauntletToUser_AB_unique" ON "_GauntletToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_GauntletToUser_B_index" ON "_GauntletToUser"("B");

-- AddForeignKey
ALTER TABLE "Heat" ADD CONSTRAINT "Heat_gauntletId_fkey" FOREIGN KEY ("gauntletId") REFERENCES "Gauntlet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GauntletToUser" ADD CONSTRAINT "_GauntletToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Gauntlet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GauntletToUser" ADD CONSTRAINT "_GauntletToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
