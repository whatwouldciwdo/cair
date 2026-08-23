import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { createConversationExport, exportMetadata, sanitizeFilename } from "@/lib/document-export";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };
const formatSchema = z.enum(["pdf", "docx", "xlsx"]);

export async function GET(request: Request, context: Context) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const format = formatSchema.safeParse(new URL(request.url).searchParams.get("format"));
  if (!format.success) return Response.json({ error: "Format ekspor tidak didukung" }, { status: 400 });

  const { id } = await context.params;
  const conversation = await db.conversation.findFirst({
    where: { id, userId: session.user.id },
    select: { title: true, messages: { orderBy: { createdAt: "asc" }, take: 500, select: { role: true, content: true, createdAt: true } } },
  });
  if (!conversation) return Response.json({ error: "Percakapan tidak ditemukan" }, { status: 404 });
  if (!conversation.messages.length) return Response.json({ error: "Percakapan belum memiliki pesan" }, { status: 400 });

  const file = await createConversationExport(format.data, { title: conversation.title, username: session.user.username, messages: conversation.messages });
  const metadata = exportMetadata[format.data];
  const filename = `${sanitizeFilename(conversation.title)}.${metadata.extension}`;
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": metadata.mimeType,
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Content-Length": String(file.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}