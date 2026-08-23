import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import { db } from "@/lib/db";
import { embedTexts } from "@/lib/ollama";
import { recognizeImage } from "@/lib/ocr";

const textTypes = new Set(["text/plain", "text/markdown"]);
const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxOcrPages = Math.max(1, Number(process.env.OCR_MAX_PAGES) || 20);
const minimumPdfText = 80;

export type ExtractedSegment = { content: string; pageNumber: number | null };
export type DocumentChunkInput = ExtractedSegment;

async function extractPdf(buffer: Buffer): Promise<ExtractedSegment[]> {
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    const digitalText = parsed.text.trim();
    if (digitalText.replace(/\s/g, "").length >= minimumPdfText) {
      return parsed.pages.map((page) => ({ content: page.text.trim(), pageNumber: page.num })).filter((page) => page.content);
    }
    if (parsed.total > maxOcrPages) throw new Error(`PDF scan dibatasi ${maxOcrPages} halaman per upload`);

    const screenshots = await parser.getScreenshot({
      scale: 2,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const pages: ExtractedSegment[] = [];
    for (const page of screenshots.pages) {
      const text = await recognizeImage(page.data);
      if (text) pages.push({ content: text, pageNumber: page.pageNumber });
    }
    return pages;
  } finally {
    await parser.destroy();
  }
}

export async function extractDocument(buffer: Buffer, name: string, mimeType: string): Promise<ExtractedSegment[]> {
  if (textTypes.has(mimeType) || /\.(txt|md)$/i.test(name)) return [{ content: buffer.toString("utf8"), pageNumber: null }];
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(name)) return [{ content: (await mammoth.extractRawText({ buffer })).value, pageNumber: null }];
  if (mimeType === "application/pdf" || /\.pdf$/i.test(name)) return extractPdf(buffer);
  if (imageTypes.has(mimeType) || /\.(png|jpe?g|webp)$/i.test(name)) return [{ content: await recognizeImage(buffer), pageNumber: 1 }];
  throw new Error("Format file tidak didukung");
}

export async function extractText(file: File) {
  const segments = await extractDocument(Buffer.from(await file.arrayBuffer()), file.name, file.type);
  return segments.map((segment) => segment.content).join("\n\n");
}

export function chunkText(raw: string, max = 1200, overlap = 180) {
  const text = raw.replace(/\0/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];
  const chunks: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + max, text.length);
    if (end < text.length) { const boundary = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(". ", end)); if (boundary > start + max * 0.55) end = boundary + 1; }
    chunks.push(text.slice(start, end).trim());
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean).slice(0, 500);
}

export function chunkSegments(segments: ExtractedSegment[], max = 1200, overlap = 180): DocumentChunkInput[] {
  return segments.flatMap((segment) => chunkText(segment.content, max, overlap).map((content) => ({ content, pageNumber: segment.pageNumber }))).slice(0, 500);
}

function cosine(a: number[], b: number[]) {
  if (a.length !== b.length) return -1;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return dot / (Math.sqrt(aa) * Math.sqrt(bb) || 1);
}

export type RetrievedSource = {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number | null;
  score: number;
  quote: string;
};

export async function retrieveContext(userId: string, conversationId: string, query: string) {
  const links = await db.conversationDocument.findMany({ where: { conversationId, conversation: { userId }, document: { status: "READY" } }, include: { document: { include: { chunks: true } } } });
  if (!links.length) return { context: "", sources: [] as RetrievedSource[] };
  const [queryVector] = await embedTexts([query]);
  const sources = links.flatMap(({ document }) => document.chunks.map((chunk) => ({
    chunkId: chunk.id, documentId: document.id, documentName: document.name,
    pageNumber: chunk.pageNumber, score: cosine(queryVector, chunk.embedding as number[]),
    quote: chunk.content,
  }))).sort((a, b) => b.score - a.score).slice(0, 6);
  const context = sources.map((source, index) => `[${index + 1}] ${source.documentName}${source.pageNumber ? `, halaman ${source.pageNumber}` : ""}\n${source.quote}`).join("\n\n");
  return { context, sources };
}

export async function retrieveEvaluationContext(query: string) {
  const documents = await db.document.findMany({ where: { status: "READY" }, include: { chunks: true } });
  if (!documents.length) return { context: "", sources: [] as RetrievedSource[] };
  const [queryVector] = await embedTexts([query]);
  const sources = documents.flatMap((document) => document.chunks.map((chunk) => ({
    chunkId: chunk.id, documentId: document.id, documentName: document.name,
    pageNumber: chunk.pageNumber, score: cosine(queryVector, chunk.embedding as number[]), quote: chunk.content,
  }))).sort((a, b) => b.score - a.score).slice(0, 6);
  return { context: sources.map((source, index) => `[${index + 1}] ${source.documentName}${source.pageNumber ? `, halaman ${source.pageNumber}` : ""}\n${source.quote}`).join("\n\n"), sources };
}