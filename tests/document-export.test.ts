import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import { createConversationExport, sanitizeFilename } from "../src/lib/document-export";

const input = {
  title: "Laporan Operasi Harian",
  username: "operator",
  metadata: {
    documentNumber: "UBPC/AI/2026/001",
    version: "2.0",
    classification: "CONFIDENTIAL" as const,
    unit: "UBP CILEGON - OPERASI",
    approvedBy: "Manager Operasi",
    issuedAt: new Date("2026-08-24T00:00:00+07:00"),
  },
  messages: [{ role: "ASSISTANT" as const, content: "Status unit **normal**.", createdAt: new Date("2026-08-24T00:00:00+07:00") }],
};

test("corporate PDF memiliki signature valid", async () => {
  const result = await createConversationExport("pdf", input);
  assert.equal(result.subarray(0, 5).toString(), "%PDF-");
  assert.ok(result.length > 1_000);
});

test("corporate DOCX memiliki container ZIP valid", async () => {
  const result = await createConversationExport("docx", input);
  assert.equal(result.subarray(0, 2).toString(), "PK");
  assert.ok(result.length > 1_000);
});

test("corporate XLSX memuat metadata, header, dan isi", async () => {
  const result = await createConversationExport("xlsx", input);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(result) as unknown as ExcelJS.Buffer);
  const sheet = workbook.getWorksheet("Percakapan");
  assert.ok(sheet);
  assert.match(sheet.headerFooter.oddHeader ?? "", /UBP CILEGON - OPERASI/);
  assert.match(sheet.headerFooter.oddHeader ?? "", /CONFIDENTIAL/);
  assert.match(sheet.headerFooter.oddFooter ?? "", /UBPC\/AI\/2026\/001/);
  assert.equal(sheet.getCell("D2").value, "Status unit normal.");
});

test("nama file ekspor aman", () => {
  assert.equal(sanitizeFilename("../../ Laporan Operasi!"), "Laporan-Operasi");
});