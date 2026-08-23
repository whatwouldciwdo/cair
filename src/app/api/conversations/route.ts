import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getAllowedModels } from "@/lib/settings";

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const conversations = await db.conversation.findMany({ where: { userId: session.user.id }, orderBy: [{ pinnedAt: "desc" }, { updatedAt: "desc" }], select: { id: true, title: true, model: true, pinnedAt: true, archivedAt: true, updatedAt: true } });
  return Response.json(conversations);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ model: z.string().min(1).max(100) }).safeParse(await request.json());
  if (!parsed.success || !(await getAllowedModels()).includes(parsed.data.model)) return Response.json({ error: "Model tidak diizinkan" }, { status: 400 });
  const conversation = await db.conversation.create({ data: { userId: session.user.id, model: parsed.data.model } });
  return Response.json(conversation, { status: 201 });
}