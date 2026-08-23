"use server";

import { hash } from "argon2";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { writeAudit } from "@/lib/audit";

async function requireAdmin() {
  const session = await auth();
  if (session?.user.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

export async function createUser(formData: FormData) {
  const session = await requireAdmin();
  const parsed = z.object({ username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/), name: z.string().trim().min(2).max(80), password: z.string().min(10).max(128), role: z.enum(["ADMIN", "USER"]), unitId: z.string().cuid().or(z.literal("")).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Data pengguna tidak valid");
  const user = await db.user.create({ data: { username: parsed.data.username.toLowerCase(), name: parsed.data.name, role: parsed.data.role, unitId: parsed.data.unitId || null, passwordHash: await hash(parsed.data.password) } });
  await writeAudit({ action: "USER_CREATE", userId: session.user.id, unitId: session.user.unitId, entityType: "User", entityId: user.id });
  revalidatePath("/admin");
}

export async function createUnit(formData: FormData) {
  const session = await requireAdmin(); const parsed = z.object({ code: z.string().trim().min(2).max(20), name: z.string().trim().min(2).max(100) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Data unit tidak valid");
  const unit = await db.unit.create({ data: { code: parsed.data.code.toUpperCase(), name: parsed.data.name } });
  await writeAudit({ action: "USER_UPDATE", userId: session.user.id, unitId: session.user.unitId, entityType: "Unit", entityId: unit.id, metadata: { operation: "create_unit" } }); revalidatePath("/admin");
}

export async function assignUnit(formData: FormData) {
  const session = await requireAdmin(); const parsed = z.object({ id: z.string().cuid(), unitId: z.string().cuid().or(z.literal("")) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Penugasan unit tidak valid");
  await db.user.update({ where: { id: parsed.data.id }, data: { unitId: parsed.data.unitId || null } });
  await writeAudit({ action: "USER_UPDATE", userId: session.user.id, unitId: session.user.unitId, entityType: "User", entityId: parsed.data.id, metadata: { operation: "assign_unit" } }); revalidatePath("/admin");
}

export async function createEvaluationCase(formData: FormData) {
  const session = await requireAdmin(); const parsed = z.object({ name: z.string().trim().min(2).max(100), question: z.string().trim().min(3).max(4000), expectedAnswer: z.string().trim().max(4000).optional(), expectedSources: z.string().trim().max(2000).optional() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Kasus evaluasi tidak valid");
  const expectedSources = parsed.data.expectedSources?.split(",").map((value) => value.trim()).filter(Boolean) ?? [];
  const evaluationCase = await db.ragEvaluationCase.create({ data: { name: parsed.data.name, question: parsed.data.question, expectedAnswer: parsed.data.expectedAnswer || null, expectedSources } });
  await writeAudit({ action: "EVALUATION_RUN", userId: session.user.id, unitId: session.user.unitId, entityType: "RagEvaluationCase", entityId: evaluationCase.id, metadata: { operation: "create_case" } }); revalidatePath("/admin");
}

export async function runEvaluation(formData: FormData) {
  const session = await requireAdmin(); const model = z.string().min(1).parse(formData.get("model"));
  const run = await db.ragEvaluationRun.create({ data: { model, createdById: session.user.id } });
  await enqueueJob("RAG_EVALUATION", { runId: run.id }, session.user.id); await writeAudit({ action: "EVALUATION_RUN", userId: session.user.id, unitId: session.user.unitId, entityType: "RagEvaluationRun", entityId: run.id }); revalidatePath("/admin");
}

export async function toggleUser(formData: FormData) {
  const session = await requireAdmin(); const id = String(formData.get("id"));
  if (id === session.user.id) throw new Error("Tidak dapat menonaktifkan akun sendiri");
  const user = await db.user.findUniqueOrThrow({ where: { id } });
  await db.user.update({ where: { id }, data: { active: !user.active } });
  await writeAudit({ action: "USER_UPDATE", userId: session.user.id, unitId: session.user.unitId, entityType: "User", entityId: id, metadata: { active: !user.active } }); revalidatePath("/admin");
}

export async function resetPassword(formData: FormData) {
  const session = await requireAdmin(); const parsed = z.object({ id: z.string().cuid(), password: z.string().min(10).max(128) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) throw new Error("Password minimal 10 karakter");
  await db.user.update({ where: { id: parsed.data.id }, data: { passwordHash: await hash(parsed.data.password) } });
  await writeAudit({ action: "USER_UPDATE", userId: session.user.id, unitId: session.user.unitId, entityType: "User", entityId: parsed.data.id, metadata: { operation: "password_reset" } });
}

export async function saveModels(formData: FormData) {
  const session = await requireAdmin(); const models = formData.getAll("models").map(String);
  if (models.length === 0) redirect("/admin?models=empty");
  await db.appSetting.upsert({ where: { key: "allowed_models" }, create: { key: "allowed_models", value: JSON.stringify(models) }, update: { value: JSON.stringify(models) } });
  await writeAudit({ action: "SETTINGS_UPDATE", userId: session.user.id, unitId: session.user.unitId, entityType: "AppSetting", entityId: "allowed_models", metadata: { modelCount: models.length } });
  revalidatePath("/admin"); revalidatePath("/chat");
  redirect("/admin?models=saved");
}