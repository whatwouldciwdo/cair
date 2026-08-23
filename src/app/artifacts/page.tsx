import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { auth } from "@/auth";
import { artifactVisibilityWhere } from "@/lib/access-control";
import { db } from "@/lib/db";
import { ArtifactList } from "./artifact-list";

export default async function ArtifactsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const artifacts = await db.artifact.findMany({ where: artifactVisibilityWhere({ id: session.user.id, role: session.user.role, unitId: session.user.unitId }), orderBy: { createdAt: "desc" }, take: 100 });
  return <main className="min-h-screen bg-slate-50 p-5 md:p-10"><div className="mx-auto max-w-6xl"><header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="text-sm font-semibold text-teal-700">PLTGU AI</p><h1 className="text-3xl font-bold text-slate-900">Pusat File</h1><p className="mt-1 text-sm text-slate-500">Artifact tersimpan, terversi, dan dibatasi sesuai hak akses Anda.</p></div><Link href="/chat" className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-medium shadow-sm"><MessageSquare className="size-4" /> Kembali ke chat</Link></header>
  <ArtifactList initial={artifacts.map((artifact) => ({ ...artifact, createdAt: artifact.createdAt.toISOString() }))} /></div></main>;
}