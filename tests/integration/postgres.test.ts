import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { claimNextJob, failJob, recoverStaleJobs } from "../../src/lib/jobs";

test("PostgreSQL: RBAC unit, atomic rate limiter, dan worker recovery", async (t) => {
  if (!process.env.TEST_DATABASE_URL) return t.skip("TEST_DATABASE_URL wajib menunjuk DB terpisah");
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  const db = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } });
  const suffix = Date.now().toString();
  const unitA = await db.unit.create({ data: { code: `ITA${suffix}`, name: "Integration A" } });
  const unitB = await db.unit.create({ data: { code: `ITB${suffix}`, name: "Integration B" } });
  const userA = await db.user.create({ data: { username: `ita${suffix}`, name: "IT A", passwordHash: "test-only", unitId: unitA.id } });
  const userB = await db.user.create({ data: { username: `itb${suffix}`, name: "IT B", passwordHash: "test-only", unitId: unitB.id } });
  try {
    const document = await db.document.create({ data: { name: "cross-unit.txt", mimeType: "text/plain", size: 4, checksum: suffix, sourcePath: "test/source", userId: userA.id, unitId: unitA.id, scope: "UNIT" } });
    assert.equal(await db.document.count({ where: { id: document.id, OR: [{ userId: userB.id }, { scope: "UNIT", unitId: userB.unitId }] } }), 0);
    const rateKey = `integration:${suffix}`;
    const counts = await Promise.all(Array.from({ length: 12 }, () => db.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt", "updatedAt")
      VALUES (${rateKey}, 1, NOW(), NOW() + INTERVAL '1 minute', NOW())
      ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1, "updatedAt" = NOW()
      RETURNING "count"
    `));
    assert.equal(Math.max(...counts.flat().map((row) => row.count)), 12);

    const queued = await db.backgroundJob.create({ data: { type: "DOCUMENT_PROCESS", payload: { documentId: document.id }, maxAttempts: 2 } });
    const claimed = await claimNextJob(`integration-${suffix}`);
    assert.equal(claimed?.id, queued.id);
    assert.equal(claimed?.attempts, 1);
    const retry = await failJob(queued.id, new Error("fault injection"));
    assert.equal(retry.status, "QUEUED");
    assert.match(retry.error ?? "", /fault injection/);

    const staleRetry = await db.backgroundJob.create({ data: { type: "DOCUMENT_PROCESS", payload: {}, status: "RUNNING", attempts: 1, maxAttempts: 3, lockedAt: new Date(0), lockedBy: "crashed-worker" } });
    const poison = await db.backgroundJob.create({ data: { type: "DOCUMENT_PROCESS", payload: {}, status: "RUNNING", attempts: 3, maxAttempts: 3, lockedAt: new Date(0), lockedBy: "crashed-worker" } });
    const recovered = await recoverStaleJobs(1);
    assert.ok(recovered.retried >= 1);
    assert.ok(recovered.poisoned >= 1);
    assert.equal((await db.backgroundJob.findUniqueOrThrow({ where: { id: staleRetry.id } })).status, "QUEUED");
    assert.equal((await db.backgroundJob.findUniqueOrThrow({ where: { id: poison.id } })).status, "FAILED");
  } finally {
    await db.backgroundJob.deleteMany({ where: { OR: [{ payload: { path: ["documentId"], equals: { } } }, { lockedBy: "crashed-worker" }] } }).catch(() => undefined);
    await db.backgroundJob.deleteMany({ where: { createdAt: { gte: new Date(Number(suffix) - 10_000) }, type: "DOCUMENT_PROCESS" } });
    await db.rateLimitBucket.deleteMany({ where: { key: `integration:${suffix}` } });
    await db.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await db.unit.deleteMany({ where: { id: { in: [unitA.id, unitB.id] } } });
    await db.$disconnect();
  }
});