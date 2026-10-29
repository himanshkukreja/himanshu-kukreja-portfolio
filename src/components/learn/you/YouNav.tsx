"use client";

/**
 * The You tab's pages (progress, notebook, saved paths, concept mastery, certificates) share this row, so it reads
 * as one place for your own stuff. Keep in sync with YOU_ROUTES in src/components/site/LearnNav.tsx.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/learn/dashboard", label: "Progress", match: /^\/learn\/dashboard/ },
  { href: "/learn/notebook", label: "Notebook", match: /^\/learn\/(notebook|notes|bookmarks)/ },
  { href: "/learn/saved", label: "Saved paths", match: /^\/learn\/saved/ },
  { href: "/learn/mastery", label: "Concept mastery", match: /^\/learn\/mastery/ },
  { href: "/learn/certificate", label: "Certificates", match: /^\/learn\/certificate/ },
];

export default function YouNav() {
  const p = usePathname() || "";
  return (
    <nav aria-label="You" className="mx-auto w-full max-w-[1320px] px-4 pt-4 sm:px-6">
      <ul className="m-0 flex list-none gap-1 overflow-x-auto border-b border-line p-0 [scrollbar-width:none]">
        {ITEMS.map((it) => {
          const on = it.match.test(p);
          return (
            <li key={it.href} className="shrink-0">
              <Link
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 font-mono text-[13px] ${on ? "border-signal text-fg" : "border-transparent text-fg-3 hover:text-fg"}`}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
