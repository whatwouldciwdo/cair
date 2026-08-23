import { randomUUID } from "node:crypto";
import { ArtifactStatus, JobType, type Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { createMessageArtifact, exportMetadata, type ExportFormat } from "@/lib/document-export";
import { embedTexts } from "@/lib/ollama";
import { chunkSegments, extractDocument } from "@/lib/rag";
import { claimNextJob, failJob, finishJob, recoverStaleJobs } from "@/lib/jobs";
import { deleteDocumentSource, readDocumentSource, writeArtifactFile } from "@/lib/storage";
import { evaluateRagCase } from "@/lib/rag-evaluation";

const workerId = `${process.env.HOSTNAME ?? "worker"}-${randomUUID()}`;
let stopping = false;

async function processJob(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>): Promise<Prisma.InputJsonValue> {
  if (job.type === JobType.DOCUMENT_PROCESS) {
    const payload = job.payload as { documentId?: string };
    if (!payload.documentId) throw new Error("Payload documentId tidak valid");
    const document = await db.document.findUnique({ where: { id: payload.documentId } });
    if (!document?.sourcePath) throw new Error("File sumber dokumen tidak ditemukan");
    await db.document.update({ where: { id: document.id }, data: { status: "PROCESSING", error: null } });
    const segments = await extractDocument(await readDocumentSource(document.sourcePath), document.name, document.mimeType);
    const chunks = chunkSegments(segments);
    if (!chunks.length) throw new Error("Dokumen tidak berisi teks yang dapat dibaca");
    const embeddings: number[][] = [];
    for (let index = 0; index < chunks.length; index += 16) embeddings.push(...await embedTexts(chunks.slice(index, index + 16).map((chunk) => chunk.content)));
    const pageCount = segments.reduce((highest, segment) => Math.max(highest, segment.pageNumber ?? 0), 0) || null;
    await db.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { documentId: document.id } });
      await tx.documentChunk.createMany({ data: chunks.map((chunk, position) => ({ documentId: document.id, position, content: chunk.content, pageNumber: chunk.pageNumber, embedding: embeddings[position] })) });
      await tx.document.update({ where: { id: document.id }, data: { status: "READY", error: null, pageCount } });
    });
    await deleteDocumentSource(document.sourcePath);
    await db.document.update({ where: { id: document.id }, data: { sourcePath: null } });
    await writeAudit({ action: "DOCUMENT_PROCESS", userId: document.userId, unitId: document.unitId, entityType: "Document", entityId: document.id, metadata: { chunks: chunks.length, pageCount } });
    return { documentId: document.id, chunks: chunks.length, pageCount };
  }
  if (job.type === JobType.ARTIFACT_GENERATE) {
    const payload = job.payload as { artifactId?: string };
    if (!payload.artifactId) throw new Error("Payload artifactId tidak valid");
    const artifact = await db.artifact.update({
      where: { id: payload.artifactId },
      data: { status: ArtifactStatus.PROCESSING, error: null },
      include: { user: { select: { username: true } }, message: { select: { content: true } }, conversation: { select: { title: true } } },
    });
    if (!artifact.message) throw new Error("Pesan sumber artifact tidak ditemukan");
    const format = artifact.format.toLowerCase() as ExportFormat;
    const file = await createMessageArtifact(format, { title: artifact.conversation?.title ?? artifact.name, author: artifact.user.username, content: artifact.message.content });
    const stored = await writeArtifactFile(file, exportMetadata[format].extension);
    await db.artifact.update({ where: { id: artifact.id }, data: { status: ArtifactStatus.READY, error: null, ...stored } });
    return { artifactId: artifact.id, size: stored.size, checksum: stored.checksum };
  }
  if (job.type === JobType.RAG_EVALUATION) {
    const payload = job.payload as { runId?: string };
    if (!payload.runId) throw new Error("Payload runId tidak valid");
    const run = await db.ragEvaluationRun.update({ where: { id: payload.runId }, data: { status: "RUNNING" } });
    const cases = await db.ragEvaluationCase.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
    for (const evaluationCase of cases) {
      const result = await evaluateRagCase(run.model, evaluationCase);
      await db.ragEvaluationResult.upsert({ where: { runId_caseId: { runId: run.id, caseId: evaluationCase.id } }, create: { runId: run.id, caseId: evaluationCase.id, ...result }, update: result });
    }
    const results = await db.ragEvaluationResult.findMany({ where: { runId: run.id } });
    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    const summary = { total: results.length, groundedRate: average(results.map((result) => result.grounded ? 1 : 0)), citationScore: average(results.map((result) => result.citationScore ?? 0)), retrievalScore: average(results.map((result) => result.retrievalScore ?? 0)), latencyMs: average(results.map((result) => result.latencyMs)) };
    await db.ragEvaluationRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", summary, finishedAt: new Date() } });
    return { runId: run.id, ...summary };
  }
  throw new Error(`Handler job ${job.type} belum tersedia`);
}

async function main() {
  await recoverStaleJobs();
  console.log(JSON.stringify({ level: "info", event: "worker.started", workerId }));
  while (!stopping) {
    const job = await claimNextJob(workerId);
    if (!job) { await new Promise((resolve) => setTimeout(resolve, 1500)); continue; }
    try { const result = await processJob(job); await finishJob(job.id, result); }
    catch (error) {
      console.error(JSON.stringify({ level: "error", event: "job.failed", workerId, jobId: job.id, message: error instanceof Error ? error.message : "Unknown error" }));
      if (job.type === JobType.ARTIFACT_GENERATE) {
        const artifactId = (job.payload as { artifactId?: string }).artifactId;
        if (artifactId) await db.artifact.updateMany({ where: { id: artifactId }, data: { status: ArtifactStatus.FAILED, error: error instanceof Error ? error.message.slice(0, 4000) : "Generasi artifact gagal" } });
      }
      if (job.type === JobType.DOCUMENT_PROCESS) {
        const documentId = (job.payload as { documentId?: string }).documentId;
        if (documentId) await db.document.updateMany({ where: { id: documentId }, data: { status: "FAILED", error: error instanceof Error ? error.message.slice(0, 4000) : "Pemrosesan dokumen gagal" } });
      }
      if (job.type === JobType.RAG_EVALUATION) {
        const runId = (job.payload as { runId?: string }).runId;
        if (runId && job.attempts >= job.maxAttempts) await db.ragEvaluationRun.updateMany({ where: { id: runId }, data: { status: "FAILED", finishedAt: new Date() } });
      }
      await failJob(job.id, error);
    }
  }
  await db.$disconnect();
}

for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; });
main().catch(async (error) => { console.error(error); await db.$disconnect(); process.exit(1); });