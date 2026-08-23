import assert from "node:assert/strict";
import test from "node:test";
import { resolveStoragePath } from "../src/lib/storage";

test("storage menolak path traversal", () => {
  assert.throws(() => resolveStoragePath("../../secret.txt"), /tidak valid/);
});

test("storage menerima path relatif internal", () => {
  assert.match(resolveStoragePath("2026/08/file.pdf"), /2026[\\/]08[\\/]file\.pdf$/);
});