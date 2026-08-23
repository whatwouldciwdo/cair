import { auth } from "@/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { deleteDocumentSource } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const document = await db.document.findFirst({ where: { id, userId: session.user.id }, select: { id: true, name: true, size: true, status: true, error: true, pageCount: true, _count: { select: { chunks: true } } } });
  return document ? Response.json(document) : Response.json({ error: "Tidak ditemukan" }, { status: 404 });
}

export async function DELETE(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const document = await db.document.findFirst({ where: { id, userId: session.user.id }, select: { id: true, sourcePath: true } });
  if (!document) return Response.json({ error: "Tidak ditemukan" }, { status: 404 });
  await db.$transaction([db.backgroundJob.updateMany({ where: { type: "DOCUMENT_PROCESS", status: { in: ["QUEUED", "RUNNING"] }, payload: { path: ["documentId"], equals: id } }, data: { status: "CANCELLED", finishedAt: new Date() } }), db.document.delete({ where: { id } })]);
  await deleteDocumentSource(document.sourcePath);
  await writeAudit({ action: "DOCUMENT_DELETE", userId: session.user.id, unitId: session.user.unitId, entityType: "Document", entityId: id });
  return new Response(null, { status: 204 });
}