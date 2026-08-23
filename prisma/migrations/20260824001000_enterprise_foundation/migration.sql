-- Enterprise production foundation (additive migration).
CREATE TYPE "DataScope" AS ENUM ('PRIVATE', 'UNIT');
CREATE TYPE "ArtifactStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED', 'DELETED');
CREATE TYPE "JobType" AS ENUM ('DOCUMENT_PROCESS', 'ARTIFACT_GENERATE', 'RAG_EVALUATION');
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGIN_FAILED', 'USER_CREATE', 'USER_UPDATE', 'DOCUMENT_UPLOAD', 'DOCUMENT_PROCESS', 'DOCUMENT_DELETE', 'CHAT_CREATE', 'CHAT_MESSAGE', 'ARTIFACT_CREATE', 'ARTIFACT_DOWNLOAD', 'ARTIFACT_DELETE', 'SETTINGS_UPDATE', 'EVALUATION_RUN');

CREATE TABLE "Unit" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "User" ADD COLUMN "unitId" TEXT;
ALTER TABLE "Document"
  ADD COLUMN "scope" "DataScope" NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN "unitId" TEXT,
  ADD COLUMN "checksum" TEXT,
  ADD COLUMN "pageCount" INTEGER,
  ADD COLUMN "sourcePath" TEXT;
ALTER TABLE "DocumentChunk" ADD COLUMN "pageNumber" INTEGER;

CREATE TABLE "MessageCitation" (
  "id" TEXT NOT NULL, "messageId" TEXT NOT NULL, "chunkId" TEXT NOT NULL,
  "citationNo" INTEGER NOT NULL, "score" DOUBLE PRECISION NOT NULL,
  "quote" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageCitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Artifact" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "format" "ArtifactFormat" NOT NULL,
  "status" "ArtifactStatus" NOT NULL DEFAULT 'PENDING', "mimeType" TEXT NOT NULL,
  "size" INTEGER, "storagePath" TEXT, "checksum" TEXT, "error" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1, "template" TEXT NOT NULL DEFAULT 'CORPORATE',
  "scope" "DataScope" NOT NULL DEFAULT 'PRIVATE', "userId" TEXT NOT NULL,
  "unitId" TEXT, "messageId" TEXT, "conversationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BackgroundJob" (
  "id" TEXT NOT NULL, "type" "JobType" NOT NULL, "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
  "payload" JSONB NOT NULL, "result" JSONB, "error" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3), "lockedBy" TEXT, "lockedAt" TIMESTAMP(3),
  "userId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL, "action" "AuditAction" NOT NULL, "entityType" TEXT, "entityId" TEXT,
  "userId" TEXT, "unitId" TEXT, "ipHash" TEXT, "userAgent" TEXT, "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RagEvaluationCase" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "question" TEXT NOT NULL, "expectedAnswer" TEXT,
  "expectedSources" JSONB, "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RagEvaluationCase_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RagEvaluationRun" (
  "id" TEXT NOT NULL, "model" TEXT NOT NULL, "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
  "summary" JSONB, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3), CONSTRAINT "RagEvaluationRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RagEvaluationResult" (
  "id" TEXT NOT NULL, "runId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "answer" TEXT NOT NULL,
  "retrievalScore" DOUBLE PRECISION, "citationScore" DOUBLE PRECISION, "grounded" BOOLEAN NOT NULL,
  "latencyMs" INTEGER NOT NULL, "details" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RagEvaluationResult_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RateLimitBucket" (
  "key" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 0, "windowStart" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");
CREATE INDEX "User_unitId_active_idx" ON "User"("unitId", "active");
CREATE INDEX "Document_unitId_scope_createdAt_idx" ON "Document"("unitId", "scope", "createdAt");
CREATE INDEX "Document_checksum_idx" ON "Document"("checksum");
CREATE INDEX "DocumentChunk_documentId_pageNumber_idx" ON "DocumentChunk"("documentId", "pageNumber");
CREATE INDEX "MessageCitation_chunkId_idx" ON "MessageCitation"("chunkId");
CREATE UNIQUE INDEX "MessageCitation_messageId_citationNo_key" ON "MessageCitation"("messageId", "citationNo");
CREATE UNIQUE INDEX "MessageCitation_messageId_chunkId_key" ON "MessageCitation"("messageId", "chunkId");
CREATE INDEX "Artifact_userId_createdAt_idx" ON "Artifact"("userId", "createdAt");
CREATE INDEX "Artifact_unitId_scope_createdAt_idx" ON "Artifact"("unitId", "scope", "createdAt");
CREATE INDEX "Artifact_status_createdAt_idx" ON "Artifact"("status", "createdAt");
CREATE INDEX "BackgroundJob_status_availableAt_idx" ON "BackgroundJob"("status", "availableAt");
CREATE INDEX "BackgroundJob_userId_createdAt_idx" ON "BackgroundJob"("userId", "createdAt");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "AuditEvent"("userId", "createdAt");
CREATE INDEX "AuditEvent_unitId_createdAt_idx" ON "AuditEvent"("unitId", "createdAt");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");
CREATE INDEX "RagEvaluationRun_createdAt_idx" ON "RagEvaluationRun"("createdAt");
CREATE UNIQUE INDEX "RagEvaluationResult_runId_caseId_key" ON "RagEvaluationResult"("runId", "caseId");
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

ALTER TABLE "User" ADD CONSTRAINT "User_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MessageCitation" ADD CONSTRAINT "MessageCitation_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BackgroundJob" ADD CONSTRAINT "BackgroundJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RagEvaluationRun" ADD CONSTRAINT "RagEvaluationRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RagEvaluationResult" ADD CONSTRAINT "RagEvaluationResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "RagEvaluationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RagEvaluationResult" ADD CONSTRAINT "RagEvaluationResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "RagEvaluationCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
