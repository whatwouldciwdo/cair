import { auth } from "@/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { exportMetadata, sanitizeFilename, type ExportFormat } from "@/lib/document-export";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const requestedFormat = new URL(request.url).searchParams.get("format");
  if (requestedFormat && !["pdf", "docx", "xlsx"].includes(requestedFormat)) return Response.json({ error: "Format tidak didukung" }, { status: 400 });
  const message = await db.message.findFirst({
    where: { id, role: "ASSISTANT", conversation: { userId: session.user.id } },
    select: { id: true, content: true, artifactFormat: true, artifactName: true, conversationId: true, conversation: { select: { title: true } } },
  });
  if (!message) return Response.json({ error: "Jawaban tidak ditemukan" }, { status: 404 });
  const format = (requestedFormat ?? message.artifactFormat?.toLowerCase()) as ExportFormat | undefined;
  if (!format) return Response.json({ error: "Format ekspor harus dipilih" }, { status: 400 });
  const metadata = exportMetadata[format];
  const filename = message.artifactName ?? `${sanitizeFilename(message.conversation.title)}.${metadata.extension}`;
  const safeName = `${sanitizeFilename(filename.replace(/\.[^.]+$/, ""))}.${metadata.extension}`;
  const artifact = await db.$transaction(async (tx) => {
    const created = await tx.artifact.create({ data: { name: safeName, format: format.toUpperCase() as "PDF" | "DOCX" | "XLSX", status: "PENDING", mimeType: metadata.mimeType, userId: session.user.id, unitId: session.user.unitId, messageId: message.id, conversationId: message.conversationId } });
    const job = await tx.backgroundJob.create({ data: { type: "ARTIFACT_GENERATE", userId: session.user.id, payload: { artifactId: created.id } } });
    return { ...created, jobId: job.id };
  });
  await writeAudit({ action: "ARTIFACT_CREATE", userId: session.user.id, unitId: session.user.unitId, entityType: "Artifact", entityId: artifact.id, metadata: { format } });
  return Response.json({ artifactId: artifact.id, jobId: artifact.jobId, status: artifact.status, statusUrl: `/api/artifacts/${artifact.id}` }, { status: 202, headers: { Location: `/api/artifacts/${artifact.id}` } });
}