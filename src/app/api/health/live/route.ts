export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", service: "chat-pltgucilegon", timestamp: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}