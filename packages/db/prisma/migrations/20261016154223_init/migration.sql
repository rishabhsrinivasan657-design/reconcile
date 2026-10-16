-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('PO', 'RR', 'INVOICE');

-- CreateEnum
CREATE TYPE "DocStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'NEEDS_REVIEW', 'READY', 'MATCHED', 'FAILED');

-- CreateEnum
CREATE TYPE "ExceptionType" AS ENUM ('SHORT_SHIP', 'OVER_SHIP', 'PRICE_VARIANCE', 'QTY_BILLED_NOT_RECEIVED', 'MISSING_DOCUMENT', 'DUPLICATE_INVOICE', 'UNMATCHED_LINE');

-- CreateEnum
CREATE TYPE "ExceptionStatus" AS ENUM ('OPEN', 'APPROVED', 'DISPUTED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "ExceptionActionType" AS ENUM ('APPROVE', 'DISPUTE', 'WRITE_OFF');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('SKU', 'FUZZY_LLM', 'MANUAL');

-- CreateEnum
CREATE TYPE "ExtractionSource" AS ENUM ('LLM', 'HUMAN');

-- CreateEnum
CREATE TYPE "LlmPurpose" AS ENUM ('EXTRACT', 'FUZZY_MATCH');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "invoicePrefix" TEXT NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uom" TEXT NOT NULL,
    "packSize" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSet" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "vendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "setId" TEXT,
    "vendorId" TEXT,
    "type" "DocType",
    "status" "DocStatus" NOT NULL DEFAULT 'UPLOADED',
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "pageCount" INTEGER,
    "docNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extraction" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "source" "ExtractionSource" NOT NULL,
    "promptVersion" TEXT,
    "model" TEXT,
    "raw" JSONB,
    "data" JSONB NOT NULL,
    "fieldConfidence" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchRun" (
    "id" TEXT NOT NULL,
    "setId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineMatch" (
    "id" TEXT NOT NULL,
    "matchRunId" TEXT NOT NULL,
    "poLineKey" TEXT,
    "rrLineKey" TEXT,
    "invLineKey" TEXT,
    "method" "MatchMethod" NOT NULL,
    "confidence" DECIMAL(5,4),
    "reasoning" TEXT,

    CONSTRAINT "LineMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exception" (
    "id" TEXT NOT NULL,
    "matchRunId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "type" "ExceptionType" NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'OPEN',
    "informational" BOOLEAN NOT NULL DEFAULT false,
    "amount" DECIMAL(14,4) NOT NULL,
    "explanation" TEXT NOT NULL,
    "lineKeys" JSONB NOT NULL,
    "documentIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exception_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionActionRecord" (
    "id" TEXT NOT NULL,
    "exceptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "ExceptionActionType" NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExceptionActionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" TEXT NOT NULL,
    "documentId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "purpose" "LlmPurpose" NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "cacheHit" BOOLEAN NOT NULL,
    "costUsd" DECIMAL(12,6) NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_code_key" ON "Vendor"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogItem_vendorId_sku_key" ON "CatalogItem"("vendorId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSet_poNumber_key" ON "DocumentSet"("poNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Document_sha256_key" ON "Document"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "Extraction_documentId_version_key" ON "Extraction"("documentId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "MatchRun_setId_version_key" ON "MatchRun"("setId", "version");

-- CreateIndex
CREATE INDEX "Exception_fingerprint_idx" ON "Exception"("fingerprint");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentSet" ADD CONSTRAINT "DocumentSet_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_setId_fkey" FOREIGN KEY ("setId") REFERENCES "DocumentSet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extraction" ADD CONSTRAINT "Extraction_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchRun" ADD CONSTRAINT "MatchRun_setId_fkey" FOREIGN KEY ("setId") REFERENCES "DocumentSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineMatch" ADD CONSTRAINT "LineMatch_matchRunId_fkey" FOREIGN KEY ("matchRunId") REFERENCES "MatchRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exception" ADD CONSTRAINT "Exception_matchRunId_fkey" FOREIGN KEY ("matchRunId") REFERENCES "MatchRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionActionRecord" ADD CONSTRAINT "ExceptionActionRecord_exceptionId_fkey" FOREIGN KEY ("exceptionId") REFERENCES "Exception"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionActionRecord" ADD CONSTRAINT "ExceptionActionRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LlmCall" ADD CONSTRAINT "LlmCall_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
