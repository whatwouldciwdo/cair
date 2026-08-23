import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { streamOllama } from "@/lib/ollama";
import { getAllowedModels } from "@/lib/settings";
import { retrieveContext } from "@/lib/rag";
import { artifactSystemPrompt, detectArtifactRequest } from "@/lib/ai-artifact";
import { consumeRateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { identityPromptFor } from "@/lib/chat-identity";

const schema = z.object({ conversationId: z.string().cuid(), content: z.string().trim().min(1).max(12000).optional(), regenerate: z.boolean().optional() });

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const rateLimit = await consumeRateLimit(`chat:${session.user.id}`, Number(process.env.CHAT_RATE_LIMIT ?? 30), 60_000);
  if (!rateLimit.allowed) return Response.json({ error: "Terlalu banyak permintaan. Coba lagi setelah jendela rate limit berakhir." }, { status: 429, headers: { ...rateLimitHeaders(rateLimit), "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAt.getTime() - Date.now()) / 1000))) } });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Pesan tidak valid" }, { status: 400 });
  const conversation = await db.conversation.findFirst({ where: { id: parsed.data.conversationId, userId: session.user.id }, include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } } });
  if (!conversation || !(await getAllowedModels()).includes(conversation.model)) return Response.json({ error: "Percakapan atau model tidak tersedia" }, { status: 404 });
  const lastUser = [...conversation.messages].reverse().find((message) => message.role === "USER");
  const content = parsed.data.regenerate ? lastUser?.content : parsed.data.content;
  if (!content) return Response.json({ error: "Pesan tidak tersedia" }, { status: 400 });
  let history = conversation.messages;
  if (parsed.data.regenerate) {
    const lastMessage = history.at(-1);
    if (lastMessage?.role === "ASSISTANT") { await db.message.delete({ where: { id: lastMessage.id } }); history = history.slice(0, -1); }
  } else {
    await db.message.create({ data: { conversationId: conversation.id, role: "USER", content } });
    if (conversation.title === "Percakapan baru") await db.conversation.update({ where: { id: conversation.id }, data: { title: content.slice(0, 60) } });
    history = [...history, { id: "pending", conversationId: conversation.id, role: "USER", content, feedback: null, artifactFormat: null, artifactName: null, createdAt: new Date() }];
  }
  const retrieval = await retrieveContext(session.user.id, conversation.id, content);
  const artifact = detectArtifactRequest(content);
  const identitySystem = { role: "system" as const, content: identityPromptFor(content) };
  const ragSystem = retrieval.context ? { role: "system" as const, content: `Jawab hanya berdasarkan konteks dokumen berikut bila relevan. Jangan mengarang. Setiap klaim yang menggunakan konteks wajib memakai sitasi inline [1], [2], dan seterusnya sesuai nomor sumber. Jangan mengubah nomor sumber.\n\n${retrieval.context}` } : null;
  const artifactSystem = artifact ? { role: "system" as const, content: artifactSystemPrompt(artifact) } : null;
  const upstream = await streamOllama(conversation.model, [identitySystem, ...(ragSystem ? [ragSystem] : []), ...(artifactSystem ? [artifactSystem] : []), ...history.map((m) => ({ role: m.role.toLowerCase() as "user" | "assistant" | "system", content: m.content }))], request.signal);
  // Attachments are scoped to this request. Keep the source documents in the
  // user's library, but do not silently reuse them for the next message.
  if (!parsed.data.regenerate) await db.conversationDocument.deleteMany({ where: { conversationId: conversation.id } });
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "", complete = "";
  const output = new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
          for (const line of lines) if (line.trim()) {
            const chunk = JSON.parse(line) as { message?: { content?: string } };
            const text = chunk.message?.content ?? ""; complete += text; controller.enqueue(encoder.encode(text));
          }
        }
        if (complete) await db.message.create({ data: {
          conversationId: conversation.id, role: "ASSISTANT", content: complete,
          artifactFormat: artifact?.format, artifactName: artifact?.filename,
          citations: { create: retrieval.sources.map((source, index) => ({
            chunkId: source.chunkId, citationNo: index + 1, score: source.score,
            quote: source.quote.slice(0, 2000),
          })) },
        } });
        controller.close();
      } catch (error) { controller.error(error); }
    },
  });
  return new Response(output, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", ...rateLimitHeaders(rateLimit) } });
}