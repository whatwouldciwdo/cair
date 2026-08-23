"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";

export async function loginAction(_state: string | undefined, formData: FormData) {
  try {
    await signIn("credentials", { username: formData.get("username"), password: formData.get("password"), redirect: false });
  } catch (error) {
    if (error instanceof AuthError) return "Username atau password salah.";
    throw error;
  }
  redirect("/chat");
}