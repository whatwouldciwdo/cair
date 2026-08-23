import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getAllowedModels } from "@/lib/settings";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  const conversation = await db.conversation.findFirst({ where: { id, userId: session.user.id }, include: {
    messages: { orderBy: { createdAt: "asc" }, include: { citations: { orderBy: { citationNo: "asc" }, include: { chunk: { select: { pageNumber: true, document: { select: { id: true, name: true } } } } } } } },
    documents: { select: { documentId: true } },
  } });
  return conversation ? Response.json(conversation) : Response.json({ error: "Tidak ditemukan" }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ title: z.string().trim().min(1).max(80).optional(), model: z.string().min(1).max(100).optional(), pinned: z.boolean().optional(), archived: z.boolean().optional() }).refine((data) => Object.values(data).some((value) => value !== undefined)).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Perubahan tidak valid" }, { status: 400 });
  if (parsed.data.model && !(await getAllowedModels()).includes(parsed.data.model)) return Response.json({ error: "Model tidak diizinkan" }, { status: 400 });
  const { id } = await context.params;
  const { pinned, archived, ...changes } = parsed.data;
  const result = await db.conversation.updateMany({ where: { id, userId: session.user.id }, data: { ...changes, ...(pinned !== undefined ? { pinnedAt: pinned ? new Date() : null } : {}), ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}) } });
  return result.count ? Response.json({ ok: true, ...parsed.data }) : Response.json({ error: "Tidak ditemukan" }, { status: 404 });
}

export async function DELETE(_request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  await db.conversation.deleteMany({ where: { id, userId: session.user.id } });
  return new Response(null, { status: 204 });
}