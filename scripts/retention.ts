import { db } from "../src/lib/db";
import { deleteArtifactFile, deleteDocumentSource } from "../src/lib/storage";

const days = (name: string, fallback: number) => Number(process.env[name] ?? fallback) * 86_400_000;
const before = (duration: number) => new Date(Date.now() - duration);

async function main() {
  const artifacts = await db.artifact.findMany({ where: { createdAt: { lt: before(days("RETENTION_ARTIFACT_DAYS", 90)) } }, select: { id: true, storagePath: true } });
  const documents = await db.document.findMany({ where: { createdAt: { lt: before(days("RETENTION_DOCUMENT_DAYS", 365)) } }, select: { id: true, sourcePath: true } });
  await Promise.all(artifacts.map((item) => deleteArtifactFile(item.storagePath)));
  await Promise.all(documents.map((item) => deleteDocumentSource(item.sourcePath)));
  const [artifactRows, documentRows, audits, jobs, buckets] = await db.$transaction([
    db.artifact.deleteMany({ where: { id: { in: artifacts.map((item) => item.id) } } }),
    db.document.deleteMany({ where: { id: { in: documents.map((item) => item.id) } } }),
    db.auditEvent.deleteMany({ where: { createdAt: { lt: before(days("RETENTION_AUDIT_DAYS", 730)) } } }),
    db.backgroundJob.deleteMany({ where: { status: { in: ["SUCCEEDED", "FAILED"] }, finishedAt: { lt: before(days("RETENTION_JOB_DAYS", 30)) } } }),
    db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
  ]);
  console.log(JSON.stringify({ artifacts: artifactRows.count, documents: documentRows.count, audits: audits.count, jobs: jobs.count, rateBuckets: buckets.count }));
}

main().finally(() => db.$disconnect());