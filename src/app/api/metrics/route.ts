import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.METRICS_TOKEN;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized\n", { status: 401 });
  const [jobs, artifacts, documents] = await Promise.all([
    db.backgroundJob.groupBy({ by: ["status"], _count: { _all: true } }),
    db.artifact.groupBy({ by: ["status"], _count: { _all: true } }),
    db.document.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const lines = ["# HELP pltgu_info Application information", "# TYPE pltgu_info gauge", 'pltgu_info{service="chat-pltgucilegon"} 1'];
  for (const row of jobs) lines.push(`pltgu_jobs_total{status="${row.status.toLowerCase()}"} ${row._count._all}`);
  for (const row of artifacts) lines.push(`pltgu_artifacts_total{status="${row.status.toLowerCase()}"} ${row._count._all}`);
  for (const row of documents) lines.push(`pltgu_documents_total{status="${row.status.toLowerCase()}"} ${row._count._all}`);
  return new Response(`${lines.join("\n")}\n`, { headers: { "Content-Type": "text/plain; version=0.0.4; charset=utf-8", "Cache-Control": "no-store" } });
}