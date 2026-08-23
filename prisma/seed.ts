import { hash } from "argon2";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
async function main() {
  const username = (process.env.ADMIN_USERNAME ?? "admin").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 10) throw new Error("ADMIN_PASSWORD wajib diisi minimal 10 karakter");
  const passwordHash = await hash(password);
  await db.user.upsert({
    where: { username },
    update: { name: process.env.ADMIN_NAME ?? "Administrator", passwordHash, role: "ADMIN", active: true },
    create: { username, name: process.env.ADMIN_NAME ?? "Administrator", passwordHash, role: "ADMIN" },
  });
  console.log(`Admin ${username} siap digunakan.`);
}
main().finally(() => db.$disconnect());