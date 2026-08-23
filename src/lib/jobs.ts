import { JobStatus, JobType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export function enqueueJob(type: JobType, payload: Prisma.InputJsonValue, userId?: string) {
  return db.backgroundJob.create({ data: { type, payload, userId } });
}

export async function claimNextJob(workerId: string) {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE "BackgroundJob" SET status = 'RUNNING'::"JobStatus", "lockedBy" = ${workerId}, "lockedAt" = NOW(), "startedAt" = COALESCE("startedAt", NOW()), attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id = (SELECT id FROM "BackgroundJob" WHERE status = 'QUEUED'::"JobStatus" AND "availableAt" <= NOW() ORDER BY "availableAt", "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
    RETURNING id
  `);
  return rows[0] ? db.backgroundJob.findUnique({ where: { id: rows[0].id } }) : null;
}

export async function finishJob(id: string, result?: Prisma.InputJsonValue) {
  return db.backgroundJob.update({ where: { id }, data: { status: JobStatus.SUCCEEDED, result, finishedAt: new Date(), lockedAt: null, lockedBy: null } });
}

export async function failJob(id: string, error: unknown) {
  const job = await db.backgroundJob.findUniqueOrThrow({ where: { id }, select: { attempts: true, maxAttempts: true } });
  const retry = job.attempts < job.maxAttempts;
  return db.backgroundJob.update({ where: { id }, data: { status: retry ? JobStatus.QUEUED : JobStatus.FAILED, error: error instanceof Error ? error.message.slice(0, 4000) : "Job gagal", availableAt: retry ? new Date(Date.now() + Math.min(300_000, 5_000 * 2 ** job.attempts)) : undefined, finishedAt: retry ? null : new Date(), lockedAt: null, lockedBy: null } });
}

export async function recoverStaleJobs(staleAfterMs = 10 * 60_000) {
  const stale = await db.backgroundJob.findMany({ where: { status: JobStatus.RUNNING, lockedAt: { lt: new Date(Date.now() - staleAfterMs) } }, select: { id: true, attempts: true, maxAttempts: true } });
  const retryIds = stale.filter((job) => job.attempts < job.maxAttempts).map((job) => job.id);
  const poisonIds = stale.filter((job) => job.attempts >= job.maxAttempts).map((job) => job.id);
  const [retried, poisoned] = await db.$transaction([
    db.backgroundJob.updateMany({ where: { id: { in: retryIds } }, data: { status: JobStatus.QUEUED, lockedAt: null, lockedBy: null, availableAt: new Date(), error: "Recovered from stale worker lock" } }),
    db.backgroundJob.updateMany({ where: { id: { in: poisonIds } }, data: { status: JobStatus.FAILED, lockedAt: null, lockedBy: null, finishedAt: new Date(), error: "Poison job: stale lock and retry budget exhausted" } }),
  ]);
  return { retried: retried.count, poisoned: poisoned.count };
}