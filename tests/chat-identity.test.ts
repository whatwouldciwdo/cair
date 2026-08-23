import assert from "node:assert/strict";
import test from "node:test";
import { chatIdentitySystemPrompt, identityPromptFor, isGreeting } from "../src/lib/chat-identity";

test("mendeteksi sapaan umum pengguna", () => {
  for (const greeting of ["Halo", "hai AI!", "Selamat pagi", "Assalamualaikum", "malam bot"]) {
    assert.equal(isGreeting(greeting), true, greeting);
  }
});

test("tidak menganggap pertanyaan substantif sebagai sapaan murni", () => {
  assert.equal(isGreeting("Halo, jelaskan jadwal inspeksi turbin"), false);
});

test("system prompt menetapkan identitas lintas model", () => {
  assert.match(chatIdentitySystemPrompt, /AI PLTGU Cilegon/);
  assert.match(identityPromptFor("Halo"), /Saya adalah AI PLTGU Cilegon/);
});