import { auth } from "@/auth";
import { artifactVisibilityWhere } from "@/lib/access-control";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { deleteArtifactFile, readArtifactFile } from "@/lib/storage";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const artifact = await db.artifact.findFirst({ where: { id, AND: [artifactVisibilityWhere({ id: session.user.id, role: session.user.role, unitId: session.user.unitId })] } });
  if (!artifact) return Response.json({ error: "Artifact tidak ditemukan" }, { status: 404 });
  if (new URL(request.url).searchParams.get("metadata") === "1") return Response.json(artifact);
  if (artifact.status !== "READY" || !artifact.storagePath) return Response.json({ error: artifact.error ?? "Artifact belum siap", status: artifact.status }, { status: 409 });
  const file = await readArtifactFile(artifact.storagePath).catch(() => null);
  if (!file) return Response.json({ error: "File artifact tidak tersedia" }, { status: 410 });
  await writeAudit({ action: "ARTIFACT_DOWNLOAD", userId: session.user.id, unitId: session.user.unitId, entityType: "Artifact", entityId: artifact.id });
  return new Response(new Uint8Array(file), { headers: { "Content-Type": artifact.mimeType, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.name)}`, "Content-Length": String(file.byteLength), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function DELETE(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const artifact = await db.artifact.findFirst({ where: { id, userId: session.user.id }, select: { id: true, storagePath: true } });
  if (!artifact) return Response.json({ error: "Artifact tidak ditemukan atau tidak dapat dihapus" }, { status: 404 });
  await db.artifact.delete({ where: { id: artifact.id } });
  await deleteArtifactFile(artifact.storagePath);
  await writeAudit({ action: "ARTIFACT_DELETE", userId: session.user.id, unitId: session.user.unitId, entityType: "Artifact", entityId: artifact.id });
  return new Response(null, { status: 204 });
}

export async function POST(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const source = await db.artifact.findFirst({ where: { id, userId: session.user.id }, select: { id: true, name: true, format: true, mimeType: true, version: true, scope: true, unitId: true, messageId: true, conversationId: true } });
  if (!source?.messageId) return Response.json({ error: "Artifact tidak dapat dibuat ulang" }, { status: 404 });
  const result = await db.$transaction(async (tx) => {
    const artifact = await tx.artifact.create({ data: { name: source.name, format: source.format, mimeType: source.mimeType, version: source.version + 1, scope: source.scope, userId: session.user.id, unitId: source.unitId, messageId: source.messageId, conversationId: source.conversationId } });
    const job = await tx.backgroundJob.create({ data: { type: "ARTIFACT_GENERATE", userId: session.user.id, payload: { artifactId: artifact.id } } });
    return { artifact, job };
  });
  await writeAudit({ action: "ARTIFACT_CREATE", userId: session.user.id, unitId: session.user.unitId, entityType: "Artifact", entityId: result.artifact.id, metadata: { regeneratedFrom: source.id, version: result.artifact.version } });
  return Response.json({ artifactId: result.artifact.id, jobId: result.job.id, status: result.artifact.status }, { status: 202, headers: { Location: `/api/artifacts/${result.artifact.id}` } });
}