"use client";

import { useActionState } from "react";
import { ArrowRight, CircleAlert, LoaderCircle, Lock, UserRound } from "lucide-react";
import { loginAction } from "./actions";

export function LoginForm() {
  const [error, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="space-y-5">
      <label className="block text-xs font-medium tracking-[0.02em] text-[#c2c6d6]">
        Email atau Username
        <span className="relative mt-1.5 block">
          <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            name="username"
            autoComplete="username"
            required
            minLength={3}
            autoFocus
            placeholder="Masukkan email/username Anda"
            className="w-full rounded-md border border-slate-700 bg-slate-800/60 py-2.5 pl-10 pr-4 text-sm text-[#d8e3fb] outline-none transition placeholder:text-slate-500 hover:border-slate-600 focus:border-blue-500 focus:bg-slate-800/80 focus:ring-1 focus:ring-blue-500"
          />
        </span>
      </label>

      <label className="block text-xs font-medium tracking-[0.02em] text-[#c2c6d6]">
        Password
        <span className="relative mt-1.5 block">
          <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            placeholder="••••••••"
            className="w-full rounded-md border border-slate-700 bg-slate-800/60 py-2.5 pl-10 pr-4 text-sm text-[#d8e3fb] outline-none transition placeholder:text-slate-500 hover:border-slate-600 focus:border-blue-500 focus:bg-slate-800/80 focus:ring-1 focus:ring-blue-500"
          />
        </span>
      </label>

      {error && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-400/25 bg-red-950/45 px-3 py-2.5 text-sm text-red-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}

      <button
        disabled={pending}
        className="group flex w-full items-center justify-center gap-2 rounded-md bg-blue-500 px-4 py-3 text-base font-semibold text-white shadow-[0_0_18px_rgba(59,130,246,.3)] transition duration-300 hover:-translate-y-0.5 hover:bg-blue-600 hover:shadow-[0_0_28px_rgba(59,130,246,.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:translate-y-0 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? (
          <LoaderCircle className="size-5 animate-spin" />
        ) : (
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
        )}
        {pending ? "Memverifikasi..." : "Masuk"}
      </button>
    </form>
  );
}