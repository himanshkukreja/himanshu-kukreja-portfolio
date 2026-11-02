"use client";

/**
 * The "Admin" link, shown only to admins (useIsAdmin: the server's answer, cached for the tab session). `variant`:
 *   header  a bordered button in the site header row (the label from sm up, the shield alone on phones); `display`
 *           sets where it shows (the course header on phones has no room: the account button carries a shield there)
 *   tab     the course tabs' small square, next to "?" and the offline library (desktop)
 *   menu    a row in the account menu
 */
import Link from "next/link";
import { useCoursePathname } from "@/components/site/SiteMode";
import { ShieldCheck } from "lucide-react";
import { useIsAdmin } from "@/lib/admin/useIsAdmin";

export default function AdminLink({ variant, className = "", display = "inline-flex", onClick }: { variant: "header" | "tab" | "menu"; className?: string; display?: string; onClick?: () => void }) {
  const { admin } = useIsAdmin();
  const on = (useCoursePathname() || "").startsWith("/admin");
  if (!admin) return null;
  if (variant === "menu")
    return (
      <Link href="/admin" onClick={onClick} className={`flex items-center gap-1.5 px-4 py-2.5 text-fg-2 hover:bg-surface-2 hover:text-fg ${className}`}>
        <span className="text-signal-text">❯</span> admin
        <ShieldCheck className="h-3.5 w-3.5 text-signal-text" aria-hidden />
      </Link>
    );
  if (variant === "tab")
    return (
      <Link
        href="/admin"
        aria-current={on ? "page" : undefined}
        aria-label="Admin"
        title="Admin"
        className={`ml-1 grid h-7 w-7 place-items-center border ${on ? "border-signal text-signal-text" : "border-line-strong text-fg-3 hover:text-fg"} ${className}`}
      >
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
      </Link>
    );
  return (
    <Link
      href="/admin"
      aria-current={on ? "page" : undefined}
      aria-label="Admin"
      title="Admin"
      className={`${display} h-10 min-w-10 shrink-0 items-center justify-center gap-1.5 border px-2 font-mono text-xs ${on ? "border-signal text-signal-text" : "border-line-strong text-fg-2 hover:text-fg"} ${className}`}
    >
      <ShieldCheck className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">admin</span>
    </Link>
  );
}
