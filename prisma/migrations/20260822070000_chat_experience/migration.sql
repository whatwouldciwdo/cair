-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN "pinnedAt" TIMESTAMP(3),
ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "MessageFeedback" AS ENUM ('UP', 'DOWN');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "feedback" "MessageFeedback";

-- CreateIndex
CREATE INDEX "Conversation_userId_archivedAt_pinnedAt_updatedAt_idx"
ON "Conversation"("userId", "archivedAt", "pinnedAt", "updatedAt");