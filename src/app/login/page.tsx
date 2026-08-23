import { redirect } from "next/navigation";
import Image from "next/image";
import { CircleHelp, LockKeyhole, Settings } from "lucide-react";
import { auth } from "@/auth";
import { EnergyBackground } from "./energy-background";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  if ((await auth())?.user) redirect("/chat");

  return (
    <main className="relative isolate flex min-h-screen min-h-dvh overflow-hidden bg-[#040d1d] text-[#d8e3fb]">
      <EnergyBackground />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_0%,rgba(4,14,31,.1)_34%,rgba(4,14,31,.72)_100%)]" />

      <header className="absolute inset-x-0 top-0 z-20 flex h-16 items-center justify-between px-5 sm:px-7">
        <p className="text-base font-bold tracking-[-0.02em] text-[#adc6ff] sm:text-xl">
          CAIR — WEB APPS
        </p>
        <div className="flex items-center gap-1 text-[#c2c6d6]">
          <button
            type="button"
            aria-label="Pengaturan"
            className="rounded-md p-2 transition hover:bg-white/5 hover:text-[#adc6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <Settings className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Bantuan"
            className="rounded-md p-2 transition hover:bg-white/5 hover:text-[#adc6ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          >
            <CircleHelp className="size-5" />
          </button>
        </div>
      </header>

      <section className="relative z-10 m-auto w-full px-4 py-24 sm:px-6">
        <div className="mx-auto w-full max-w-md overflow-hidden rounded-lg border border-slate-700/60 bg-slate-950/45 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="relative h-36 overflow-hidden sm:h-40">
            <Image
              src="/pltgu-login-hero.webp"
              alt="Ilustrasi fasilitas pembangkit listrik PLTGU"
              fill
              priority
              sizes="(max-width: 480px) calc(100vw - 32px), 448px"
              className="object-cover opacity-90 mix-blend-screen"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/15 to-transparent" />
          </div>

          <div className="px-6 pb-7 pt-3 sm:px-8 sm:pb-8">
            <div className="mb-7 text-center">
              <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#d8e3fb]">
                CAIR
              </h1>
              <p className="mt-1 text-sm text-[#c2c6d6]">
                Cilegon AI &amp; Intelligent Resource
              </p>
            </div>
            <LoginForm />
            <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
              <LockKeyhole className="size-3.5" />
              Akses internal terlindungi
            </p>
          </div>
        </div>
      </section>

      <footer className="absolute inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-center gap-x-8 gap-y-1 px-4 py-4 text-xs text-[#c2c6d6]/75">
        <p>© {new Date().getFullYear()} PLTGU Cilegon</p>
        <p className="hidden sm:block">Private AI · On-Premise</p>
      </footer>
    </main>
  );
}