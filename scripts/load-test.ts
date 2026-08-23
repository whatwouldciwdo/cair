import autocannon from "autocannon";
import { PrismaClient } from "@prisma/client";

async function main() {
  const base = process.env.LOAD_BASE_URL ?? "http://127.0.0.1:3006";
  const duration = Number(process.env.LOAD_DURATION_SECONDS ?? 20);
  const connections = Number(process.env.LOAD_CONNECTIONS ?? 20);
  const targets = ["/api/health/live", "/api/health/ready"];

  for (const path of targets) {
    const result = await autocannon({ url: `${base}${path}`, connections, duration, pipelining: 1 });
    console.log(`${path}: ${result.requests.average} req/s, p99 ${result.latency.p99} ms, errors ${result.errors}`);
    if (result.errors > 0 || result.timeouts > 0 || result.latency.p99 > Number(process.env.LOAD_P99_LIMIT_MS ?? 1_000)) process.exitCode = 1;
  }

  const cookie = process.env.LOAD_SESSION_COOKIE;
  const conversationId = process.env.LOAD_CONVERSATION_ID;
  if (cookie && conversationId) {
    const chat = await autocannon({
      url: `${base}/api/chat`, connections: Math.min(connections, 5), duration,
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ conversationId, content: "Jawab singkat: status sistem?" }),
    });
    console.log(`/api/chat: ${chat.requests.average} req/s, p99 ${chat.latency.p99} ms, 2xx ${chat["2xx"]}, 429 ${chat["4xx"]}`);
    if (chat.errors > 0 || chat.timeouts > 0) process.exitCode = 1;

    const upload = await autocannon({
      url: `${base}/api/documents`, connections: Math.min(connections, 3), duration: Math.min(duration, 10),
      method: "POST", headers: { cookie, "content-type": "multipart/form-data; boundary=loadBoundary" },
      body: "--loadBoundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"load.txt\"\r\nContent-Type: text/plain\r\n\r\nload test document\r\n--loadBoundary--\r\n",
    });
    console.log(`/api/documents: ${upload.requests.average} req/s, p99 ${upload.latency.p99} ms, errors ${upload.errors}`);
    if (upload.errors > 0 || upload.timeouts > 0) process.exitCode = 1;
  } else {
    console.warn("LOAD_SESSION_COOKIE/LOAD_CONVERSATION_ID tidak ada: authenticated chat/upload load test dilewati.");
  }

  if (process.env.TEST_DATABASE_URL) {
    const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
    const key = `load:${Date.now()}`;
    try {
      const operations = Number(process.env.LOAD_QUEUE_OPERATIONS ?? 200);
      const started = performance.now();
      await db.backgroundJob.createMany({ data: Array.from({ length: operations }, (_, index) => ({ type: "RAG_EVALUATION" as const, payload: { load: key, index } })) });
      const elapsed = performance.now() - started;
      const count = await db.backgroundJob.count({ where: { payload: { path: ["load"], equals: key } } });
      console.log(`queue: ${count} inserts, ${Math.round((count / elapsed) * 1000)} jobs/s`);
      if (count !== operations) process.exitCode = 1;
      await db.backgroundJob.deleteMany({ where: { payload: { path: ["load"], equals: key } } });
    } finally { await db.$disconnect(); }
  } else console.warn("TEST_DATABASE_URL tidak ada: queue stress test dilewati.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});