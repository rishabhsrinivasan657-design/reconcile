-- CreateEnum
CREATE TYPE "SetStatus" AS ENUM ('WAITING', 'MATCHED', 'NEEDS_REVIEW');

-- AlterTable
ALTER TABLE "DocumentSet" ADD COLUMN     "notes" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "provisional" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "SetStatus" NOT NULL DEFAULT 'WAITING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "waitingUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Exception" ADD COLUMN     "carriedOverFromId" TEXT;

-- AlterTable
ALTER TABLE "Extraction" ADD COLUMN     "locations" JSONB,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewReasons" JSONB NOT NULL DEFAULT '[]';
