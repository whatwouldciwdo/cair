import { expect, test } from "@playwright/test";

const admin = { username: process.env.E2E_ADMIN_USERNAME ?? "admin", password: process.env.E2E_ADMIN_PASSWORD ?? "" };

async function login(page: import("@playwright/test").Page, username = admin.username, password = admin.password) {
  await page.goto("/login");
  await page.getByLabel("Email atau Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/chat/);
}

test("login dan Stitch chat shell hidup", async ({ page }) => {
  test.skip(!admin.password, "E2E_ADMIN_PASSWORD wajib tersedia");
  await login(page);
  await expect(page.getByText("Ollama Chat", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Percakapan baru/i })).toBeVisible();
  await expect(page.getByPlaceholder(/Kirim pesan/i)).toBeVisible();
});

test("upload dokumen dan chat/artifact controls tersedia", async ({ page }) => {
  test.skip(!admin.password, "E2E_ADMIN_PASSWORD wajib tersedia");
  await login(page);
  await page.getByRole("button", { name: /Dokumen/i }).click();
  await expect(page.getByText(/Unggah dokumen/i)).toBeVisible();
  const uploadResponse = page.waitForResponse((response) => response.url().includes("/api/documents") && response.request().method() === "POST");
  await page.locator('input[type="file"]').setInputFiles({ name: `uat-${Date.now()}.txt`, mimeType: "text/plain", buffer: Buffer.from("Pompa utama berstatus siap operasi.") });
  expect((await uploadResponse).status()).toBe(202);
  await expect(page.getByPlaceholder(/Kirim pesan/i)).toBeEnabled();
});

test("chat mengirim request streaming dan rate-limit headers tersedia", async ({ page }) => {
  test.skip(!admin.password, "E2E_ADMIN_PASSWORD wajib tersedia");
  await login(page);
  const responsePromise = page.waitForResponse((response) => response.url().endsWith("/api/chat") && response.request().method() === "POST");
  await page.getByPlaceholder(/Kirim pesan/i).fill("Siapa kamu? Jawab singkat.");
  await page.getByPlaceholder(/Kirim pesan/i).press("Enter");
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(response.headers()["ratelimit-limit"]).toBeTruthy();
  await expect(page.getByText("Siapa kamu? Jawab singkat.")).toBeVisible();
});

test("admin dapat membuka governance", async ({ page }) => {
  test.skip(!admin.password, "E2E_ADMIN_PASSWORD wajib tersedia");
  await login(page);
  await page.goto("/admin");
  await expect(page.getByText("Administrasi PLTGU AI")).toBeVisible();
  await expect(page.getByText("Unit / Divisi")).toBeVisible();
});

test("user biasa ditolak dari governance lintas unit", async ({ page }) => {
  const user = process.env.E2E_USER_USERNAME, password = process.env.E2E_USER_PASSWORD;
  test.skip(!user || !password, "Kredensial user lintas unit belum tersedia");
  await login(page, user, password);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/chat/);
});