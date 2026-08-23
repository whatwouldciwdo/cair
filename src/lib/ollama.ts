const baseUrl = process.env.OLLAMA_BASE_URL ?? "http://10.8.140.75:11434";

export type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

export async function getOllamaModels() {
  const response = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000), cache: "no-store" });
  if (!response.ok) throw new Error("Ollama tidak dapat dihubungi");
  const data = await response.json() as { models?: { name: string }[] };
  return data.models?.map((model) => model.name) ?? [];
}

export async function streamOllama(model: string, messages: OllamaMessage[], signal: AbortSignal) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });
  if (!response.ok || !response.body) throw new Error(`Ollama merespons ${response.status}`);
  return response.body;
}

export async function chatOllama(model: string, messages: OllamaMessage[]) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false }), signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`Ollama merespons ${response.status}`);
  const data = await response.json() as { message?: { content?: string } };
  if (!data.message?.content) throw new Error("Jawaban evaluasi Ollama kosong");
  return data.message.content;
}

export async function embedTexts(input: string[]) {
  const model = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text";
  const response = await fetch(`${baseUrl}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Embedding Ollama gagal (${response.status})`);
  const data = await response.json() as { embeddings?: number[][] };
  if (!data.embeddings || data.embeddings.length !== input.length) throw new Error("Embedding Ollama tidak lengkap");
  return data.embeddings;
}