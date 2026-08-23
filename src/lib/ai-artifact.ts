import type { ArtifactFormat } from "@prisma/client";
import { sanitizeFilename } from "@/lib/document-export";

export type ArtifactRequest = { format: ArtifactFormat; filename: string };

const formatPatterns: Array<[ArtifactFormat, RegExp]> = [
  ["DOCX", /(?:\.docx\b|\bdocx\b|\bword\b|dokumen\s+word|file\s+word)/i],
  ["XLSX", /(?:\.xlsx\b|\bxlsx\b|\bexcel\b|spreadsheet|lembar\s+kerja)/i],
  ["PDF", /(?:\.pdf\b|\bpdf\b)/i],
];

const creationIntent = /(?:buat(?:kan)?|bikin(?:kan)?|hasilkan|generate|siapkan|jadikan|kirim(?:kan)?|berikan|export|ekspor|unduh|download|format|file|template|dokumen)/i;

export function detectArtifactRequest(content: string): ArtifactRequest | null {
  if (!creationIntent.test(content)) return null;
  const format = formatPatterns.find(([, pattern]) => pattern.test(content))?.[0];
  if (!format) return null;
  const explicitName = content.match(/(?:nama(?:kan)?|filename|file\s+bernama)\s*["“']?([^"”'\n]{2,80})/i)?.[1];
  const subject = explicitName ?? content
    .replace(/(?:tolong|mohon|buatkan|buat|bikinkan|bikin|dalam|menjadi|format|file|dokumen|word|excel|pdf|docx|xlsx|untuk|saya)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const extension = format.toLowerCase();
  return { format, filename: `${sanitizeFilename(subject || `dokumen-${extension}`).toLowerCase()}.${extension}` };
}

export function artifactSystemPrompt(request: ArtifactRequest) {
  const guidance = request.format === "XLSX"
    ? "Susun jawaban sebagai data tabular Markdown. Gunakan baris pertama sebagai header tabel dan pastikan setiap baris memiliki jumlah kolom yang sama."
    : "Susun isi dokumen lengkap, profesional, dan siap dipakai. Gunakan heading, paragraf, daftar, serta placeholder dalam tanda kurung siku bila data pengguna belum tersedia.";
  return `Pengguna meminta file ${request.format}. ${guidance} Jangan menulis base64, XML, atau instruksi unduh. Sistem aplikasi akan mengubah jawabanmu menjadi file bernama ${request.filename}.`;
}