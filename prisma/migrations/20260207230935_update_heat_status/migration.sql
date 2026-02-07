-- CreateEnum
CREATE TYPE "HeatSignupStatus" AS ENUM ('UNBEATEN', 'BEATEN', 'GIVEN_UP');

-- AlterTable
ALTER TABLE "HeatSignup" ADD COLUMN     "status" "HeatSignupStatus" NOT NULL DEFAULT 'UNBEATEN';
