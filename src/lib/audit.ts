import { createHash } from "node:crypto";
import type { AuditAction, Prisma } from "@prisma/client";
import { db } from "@/lib/db";

const sensitiveKey = /password|token|secret|authorization|cookie/i;

function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => redact(item) ?? null);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? "[REDACTED]" : redact(item) ?? null]));
  return String(value);
}

export async function writeAudit(input: {
  action: AuditAction;
  request?: Request;
  userId?: string | null;
  unitId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: unknown;
}) {
  try {
    const forwarded = input.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const ipHash = forwarded && process.env.AUDIT_IP_SALT
      ? createHash("sha256").update(`${process.env.AUDIT_IP_SALT}:${forwarded}`).digest("hex")
      : undefined;
    await db.auditEvent.create({ data: {
      action: input.action, userId: input.userId, unitId: input.unitId,
      entityType: input.entityType, entityId: input.entityId, ipHash,
      userAgent: input.request?.headers.get("user-agent")?.slice(0, 500),
      metadata: redact(input.metadata),
    } });
  } catch (error) {
    console.error("audit_write_failed", error);
  }
}
