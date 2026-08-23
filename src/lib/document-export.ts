import { AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType, TextRun } from "docx";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";

export type ExportFormat = "pdf" | "docx" | "xlsx";
export type ExportMessage = { role: "USER" | "ASSISTANT" | "SYSTEM"; content: string; createdAt: Date };
export type CorporateExportMetadata = {
  documentNumber?: string;
  version?: string;
  classification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  unit?: string;
  approvedBy?: string;
  issuedAt?: Date;
};
type ExportInput = { title: string; username: string; messages: ExportMessage[]; metadata?: CorporateExportMetadata };
type ArtifactInput = { title: string; author: string; content: string; metadata?: CorporateExportMetadata };
const defaultUnit = "UBP CILEGON";
const defaultClassification = "INTERNAL";

function corporateMetadata(input: { metadata?: CorporateExportMetadata }) {
  const issuedAt = input.metadata?.issuedAt ?? new Date();
  return {
    issuedAt,
    documentNumber: input.metadata?.documentNumber ?? `AI/${issuedAt.getUTCFullYear()}/${Date.now().toString().slice(-6)}`,
    version: input.metadata?.version ?? "1.0",
    classification: input.metadata?.classification ?? defaultClassification,
    unit: input.metadata?.unit ?? defaultUnit,
    approvedBy: input.metadata?.approvedBy ?? "-",
  };
}

export const exportMetadata: Record<ExportFormat, { mimeType: string; extension: string }> = {
  pdf: { mimeType: "application/pdf", extension: "pdf" },
  docx: { mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx" },
  xlsx: { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" },
};

function roleLabel(role: ExportMessage["role"]) {
  return role === "USER" ? "Anda" : role === "ASSISTANT" ? "PLTGU AI" : "Sistem";
}

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(value);
}

function plainText(value: string) {
  return value
    .replace(/```(?:\w+)?\n([\s\S]*?)```/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~`]/g, "")
    .trim();
}

async function createPdf(input: ExportInput) {
  const metadata = corporateMetadata(input);
  const document = new PDFDocument({ size: "A4", margins: { top: 54, right: 54, bottom: 58, left: 54 }, info: { Title: input.title, Author: input.username, Subject: "Dokumen korporat PLTGU AI" } });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  const footer = (pageNumber: number) => {
    document.save().moveTo(54, document.page.height - 42).lineTo(document.page.width - 54, document.page.height - 42).strokeColor("#CBD5E1").stroke();
    document.fillColor("#64748B").font("Helvetica").fontSize(8).text("Dokumen dibuat secara elektronik melalui PLTGU AI", 54, document.page.height - 32, { continued: true });
    document.text(`  |  Halaman ${pageNumber}`, { align: "right" }); document.restore();
  };
  document.font("Helvetica-Bold").fontSize(18).fillColor("#0f5968").text(input.title);
  document.moveDown(0.35).font("Helvetica").fontSize(9).fillColor("#64748b").text(`Nomor: ${metadata.documentNumber}  |  Versi ${metadata.version}  |  ${dateLabel(metadata.issuedAt)}`);
  document.fontSize(9).text(`Penyusun: @${input.username}  |  Persetujuan: ${metadata.approvedBy}`);
  document.moveDown(0.5).rect(document.x, document.y, 100, 18).fill("#E6F6F8").fillColor("#0F5968").font("Helvetica-Bold").fontSize(8).text(metadata.classification, document.x + 8, document.y - 13);
  document.moveDown(1);
  for (const message of input.messages) {
    document.font("Helvetica-Bold").fontSize(10).fillColor(message.role === "USER" ? "#334155" : "#0f766e").text(`${roleLabel(message.role)} - ${dateLabel(message.createdAt)}`);
    document.moveDown(0.25).font("Helvetica").fontSize(10).fillColor("#1e293b").text(plainText(message.content), { lineGap: 2 });
    document.moveDown(0.8);
  }
  const range = document.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) { document.switchToPage(index); footer(index - range.start + 1); }
  document.end();
  return completed;
}

async function createDocx(input: ExportInput) {
  const metadata = corporateMetadata(input);
  const children: Paragraph[] = [
    new Paragraph({ text: input.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: `Penyusun: @${input.username} | Persetujuan: ${metadata.approvedBy} | ${dateLabel(metadata.issuedAt)}`, color: "64748B", italics: true })] }),
  ];
  for (const message of input.messages) {
    children.push(
      new Paragraph({ children: [new TextRun({ text: `${roleLabel(message.role)} - ${dateLabel(message.createdAt)}`, bold: true, color: message.role === "USER" ? "334155" : "0F766E" })], spacing: { before: 280, after: 80 } }),
      ...plainText(message.content).split(/\n{2,}/).map((text) => new Paragraph({ text, spacing: { after: 120 } })),
    );
  }
  children.splice(1, 0,
    new Paragraph({ children: [new TextRun({ text: `Nomor: ${metadata.documentNumber}   |   Versi ${metadata.version}   |   ${metadata.classification}`, bold: true, color: "0F5968", size: 18 })], shading: { type: ShadingType.CLEAR, fill: "E6F6F8" }, spacing: { after: 180 } }),
  );
  const document = new Document({ title: input.title, creator: input.username, description: "Dokumen korporat PLTGU AI", sections: [{
    properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Dokumen elektronik PLTGU AI  |  Halaman ", color: "64748B", size: 16 }), new TextRun({ children: [PageNumber.CURRENT], color: "64748B", size: 16 })] })] }) },
    children,
  }] });
  return Packer.toBuffer(document);
}

async function createXlsx(input: ExportInput) {
  const metadata = corporateMetadata(input);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = input.username;
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Percakapan", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.headerFooter.oddFooter = `&L${metadata.documentNumber}&C&P dari &N&RVersi ${metadata.version}`;
  sheet.columns = [
    { header: "No.", key: "number", width: 8 },
    { header: "Waktu", key: "createdAt", width: 24 },
    { header: "Pengirim", key: "role", width: 16 },
    { header: "Isi", key: "content", width: 100 },
  ];
  input.messages.forEach((message, index) => sheet.addRow({ number: index + 1, createdAt: message.createdAt, role: roleLabel(message.role), content: plainText(message.content) }));
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
  sheet.getColumn("createdAt").numFmt = "dd mmm yyyy hh:mm";
  sheet.getColumn("content").alignment = { vertical: "top", wrapText: true };
  sheet.autoFilter = { from: "A1", to: "D1" };
  const data = await workbook.xlsx.writeBuffer();
  return Buffer.from(data);
}

export function sanitizeFilename(value: string) {
  const safe = value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return safe || "percakapan";
}

export async function createConversationExport(format: ExportFormat, input: ExportInput) {
  if (format === "pdf") return createPdf(input);
  if (format === "docx") return createDocx(input);
  return createXlsx(input);
}

function parseMarkdownTable(content: string) {
  const rows = content.split("\n").map((line) => line.trim()).filter((line) => line.startsWith("|") && line.endsWith("|")).map((line) => line.slice(1, -1).split("|").map((cell) => plainText(cell.trim())));
  return rows.filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
}

export async function createMessageArtifact(format: ExportFormat, input: ArtifactInput) {
  if (format === "xlsx") {
    const metadata = corporateMetadata(input);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = input.author;
    const sheet = workbook.addWorksheet("Hasil AI", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.headerFooter.oddFooter = `&L${metadata.documentNumber}&C&P dari &N&RVersi ${metadata.version}`;
    const table = parseMarkdownTable(input.content);
    if (table.length >= 2) table.forEach((row) => sheet.addRow(row));
    else {
      sheet.addRow([input.title]);
      plainText(input.content).split(/\n+/).filter(Boolean).forEach((line) => sheet.addRow([line]));
    }
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } };
    sheet.columns.forEach((column) => { const values = column.values ?? []; column.width = Math.min(60, Math.max(16, ...values.slice(1).map((value) => String(value ?? "").length + 2))); column.alignment = { vertical: "top", wrapText: true }; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
  const message: ExportMessage = { role: "ASSISTANT", content: input.content, createdAt: new Date() };
  const exportInput: ExportInput = { title: input.title, username: input.author, messages: [message], metadata: input.metadata };
  return format === "pdf" ? createPdf(exportInput) : createDocx(exportInput);
}