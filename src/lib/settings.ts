import { db } from "@/lib/db";
import { getOllamaModels } from "@/lib/ollama";

export async function getAllowedModels() {
  const setting = await db.appSetting.findUnique({ where: { key: "allowed_models" } });
  if (setting) {
    try {
      const models = JSON.parse(setting.value) as unknown;
      if (Array.isArray(models) && models.length > 0 && models.every((model) => typeof model === "string")) return models;
    } catch {
      // Jika setting rusak/kosong, pulihkan dari model yang tersedia di Ollama.
    }
  }
  try { return await getOllamaModels(); } catch { return []; }
}