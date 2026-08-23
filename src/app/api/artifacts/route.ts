import { auth } from "@/auth";
import { artifactVisibilityWhere } from "@/lib/access-control";
import { db } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const take = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 100);
  const artifacts = await db.artifact.findMany({
    where: artifactVisibilityWhere({ id: session.user.id, role: session.user.role, unitId: session.user.unitId }),
    orderBy: { createdAt: "desc" }, take,
    select: { id: true, name: true, format: true, status: true, mimeType: true, size: true, checksum: true, version: true, scope: true, error: true, createdAt: true, updatedAt: true },
  });
  return Response.json(artifacts);
}