import path from "node:path";
import { createWorker, type Worker } from "tesseract.js";

const languages = "ind";
let workerPromise: Promise<Worker> | undefined;

function languagePath() {
  const packageRoot = path.dirname(require.resolve("@tesseract.js-data/ind/package.json"));
  return path.join(packageRoot, "4.0.0");
}

async function getWorker() {
  workerPromise ??= createWorker(languages, undefined, {
    langPath: languagePath(),
    gzip: true,
    cacheMethod: "none",
  }).catch((error) => {
    workerPromise = undefined;
    throw error;
  });
  return workerPromise;
}

export async function recognizeImage(image: Buffer | Uint8Array) {
  try {
    const worker = await getWorker();
    const result = await worker.recognize(Buffer.from(image));
    return result.data.text.trim();
  } catch (error) {
    workerPromise = undefined;
    const message = error instanceof Error ? error.message : "kesalahan OCR tidak dikenal";
    throw new Error(`OCR gagal: ${message}`);
  }
}