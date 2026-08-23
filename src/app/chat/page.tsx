import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getAllowedModels } from "@/lib/settings";
import { ChatApp } from "./chat-app";

export default async function ChatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [conversations, models] = await Promise.all([db.conversation.findMany({ where: { userId: session.user.id }, orderBy: [{ pinnedAt: "desc" }, { updatedAt: "desc" }], select: { id: true, title: true, model: true, pinnedAt: true, archivedAt: true, updatedAt: true } }), getAllowedModels()]);
  return <ChatApp user={session.user} initialConversations={conversations} models={models} />;
}