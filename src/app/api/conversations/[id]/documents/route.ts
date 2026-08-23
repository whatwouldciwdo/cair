import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ documentIds: z.array(z.string().cuid()).max(10) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Pilihan dokumen tidak valid" }, { status: 400 });
  const { id } = await context.params;
  const [conversation, count] = await Promise.all([db.conversation.findFirst({ where: { id, userId: session.user.id }, select: { id: true } }), db.document.count({ where: { id: { in: parsed.data.documentIds }, userId: session.user.id, status: "READY" } })]);
  if (!conversation) return Response.json({ error: "Percakapan tidak ditemukan" }, { status: 404 });
  if (count !== parsed.data.documentIds.length) return Response.json({ error: "Dokumen tidak tersedia" }, { status: 400 });
  await db.$transaction([db.conversationDocument.deleteMany({ where: { conversationId: id } }), db.conversationDocument.createMany({ data: parsed.data.documentIds.map((documentId) => ({ conversationId: id, documentId })) })]);
  return Response.json({ documentIds: parsed.data.documentIds });
}