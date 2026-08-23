import assert from "node:assert/strict";
import test from "node:test";
import { lexicalGroundingScore } from "../src/lib/rag-evaluation";

test("grounding leksikal tinggi untuk jawaban yang berasal dari konteks", () => {
  assert.ok(lexicalGroundingScore("Pompa mengalami tekanan tinggi", "Dokumen menyatakan pompa mengalami tekanan tinggi") >= 0.75);
});

test("grounding leksikal rendah untuk jawaban tidak terkait", () => {
  assert.equal(lexicalGroundingScore("turbin rusak", "jadwal inspeksi pompa"), 0);
});