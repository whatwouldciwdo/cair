import { auth } from "@/auth";
import { documentVisibilityWhere } from "@/lib/access-control";
import { db } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const citation = await db.messageCitation.findFirst({
    where: {
      id,
      message: { conversation: { userId: session.user.id } },
      chunk: { document: documentVisibilityWhere({ id: session.user.id, role: session.user.role, unitId: session.user.unitId }) },
    },
    select: { id: true, citationNo: true, score: true, quote: true, chunk: { select: { id: true, position: true, pageNumber: true, content: true, document: { select: { id: true, name: true, pageCount: true } } } } },
  });
  return citation ? Response.json(citation) : Response.json({ error: "Sumber tidak ditemukan" }, { status: 404 });
}