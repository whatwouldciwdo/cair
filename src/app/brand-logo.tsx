import { Bot } from "lucide-react";

export function BrandLogo({ className = "size-9" }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white ${className}`} aria-hidden="true">
      <Bot className="size-3/5" strokeWidth={2} />
    </span>
  );
}