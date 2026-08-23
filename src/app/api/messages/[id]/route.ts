import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = z.object({ feedback: z.enum(["UP", "DOWN"]).nullable() }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Feedback tidak valid" }, { status: 400 });
  const { id } = await context.params;
  const result = await db.message.updateMany({ where: { id, role: "ASSISTANT", conversation: { userId: session.user.id } }, data: { feedback: parsed.data.feedback } });
  return result.count ? Response.json({ ok: true }) : Response.json({ error: "Pesan tidak ditemukan" }, { status: 404 });
}