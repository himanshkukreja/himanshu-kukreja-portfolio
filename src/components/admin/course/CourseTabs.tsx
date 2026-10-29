"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/admin/learners/bits";

const TABS = [
  { href: "/admin/course", label: "overview" },
  { href: "/admin/course/dropoff", label: "section drop-off" },
] as const;

/** The two views under the Course nav item. */
export default function CourseTabs({ className }: { className?: string }) {
  const pathname = usePathname() || "";
  return (
    <nav aria-label="Course views" className={cx("relative mb-5 flex max-w-full overflow-x-auto border-b border-line [scrollbar-width:none]", className)}>
      {TABS.map((t) => {
        const on = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cx("-mb-px flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 font-mono text-[13px]", on ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
