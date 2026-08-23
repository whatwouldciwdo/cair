import { auth } from "@/auth";
import { documentVisibilityWhere } from "@/lib/access-control";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { deleteDocumentSource, writeDocumentSource } from "@/lib/storage";

export const runtime = "nodejs";
const maxBytes = 10 * 1024 * 1024;

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await db.document.findMany({ where: documentVisibilityWhere({ id: session.user.id, role: session.user.role, unitId: session.user.unitId }), orderBy: { createdAt: "desc" }, select: { id: true, name: true, mimeType: true, size: true, status: true, error: true, pageCount: true, scope: true, createdAt: true, _count: { select: { chunks: true } } } }));
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "File tidak tersedia" }, { status: 400 });
  if (file.size <= 0 || file.size > maxBytes) return Response.json({ error: "Ukuran file harus 1 byte–10 MB" }, { status: 400 });
  if (!/\.(pdf|docx|txt|md|png|jpe?g|webp)$/i.test(file.name)) return Response.json({ error: "Format harus PDF, DOCX, TXT, Markdown, PNG, JPG, atau WebP" }, { status: 400 });
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "bin";
  const stored = await writeDocumentSource(Buffer.from(await file.arrayBuffer()), extension);
  try {
    const { document, job } = await db.$transaction(async (tx) => {
      const document = await tx.document.create({ data: { userId: session.user.id, name: file.name.slice(0, 180), mimeType: file.type || "application/octet-stream", size: file.size, checksum: stored.checksum, sourcePath: stored.storagePath } });
      const job = await tx.backgroundJob.create({ data: { type: "DOCUMENT_PROCESS", userId: session.user.id, payload: { documentId: document.id } } });
      return { document, job };
    });
    await writeAudit({ action: "DOCUMENT_UPLOAD", request, userId: session.user.id, unitId: session.user.unitId, entityType: "Document", entityId: document.id, metadata: { name: document.name, size: document.size, jobId: job.id } });
    return Response.json({ ...document, jobId: job.id, _count: { chunks: 0 } }, { status: 202, headers: { Location: `/api/documents/${document.id}` } });
  } catch (error) {
    await deleteDocumentSource(stored.storagePath);
    throw error;
  }
}