import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verify } from "argon2";
import { z } from "zod";
import { db } from "@/lib/db";

const credentialsSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(8).max(128),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { username: {}, password: { type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({ where: { username: parsed.data.username.toLowerCase() } });
        if (!user?.active || !(await verify(user.passwordHash, parsed.data.password))) return null;
        return { id: user.id, name: user.name, username: user.username, role: user.role, unitId: user.unitId };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        token.unitId = user.unitId;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.id);
      session.user.username = String(token.username);
      session.user.role = token.role === "ADMIN" ? "ADMIN" : "USER";
      session.user.unitId = typeof token.unitId === "string" ? token.unitId : null;
      return session;
    },
  },
});