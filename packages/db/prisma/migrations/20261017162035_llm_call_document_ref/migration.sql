-- AlterTable
ALTER TABLE "LlmCall" ADD COLUMN     "documentRef" TEXT,
ALTER COLUMN "costUsd" DROP NOT NULL;
