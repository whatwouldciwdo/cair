import "next-auth";

declare module "next-auth" {
  interface User {
    username: string;
    role: "ADMIN" | "USER";
    unitId: string | null;
  }
  interface Session {
    user: {
      id: string;
      name?: string | null;
      username: string;
      role: "ADMIN" | "USER";
      unitId: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: "ADMIN" | "USER";
    unitId: string | null;
  }
}