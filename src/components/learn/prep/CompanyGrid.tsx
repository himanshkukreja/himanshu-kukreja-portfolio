"use client";

/**
 * Companies with a name search and a category filter (/learn/prep/companies). On the Prep hub (`limit`)
 * it shows the first few until you search, then every match.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { CATEGORY_LABEL, PREP_CATEGORIES, type CompanySummary, type PrepCategory } from "@/lib/learn/prep/types";
import CompanyLogo from "./CompanyLogo";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export default function CompanyGrid({ companies, limit }: { companies: CompanySummary[]; limit?: number }) {
  const [cat, setCat] = useState<PrepCategory | "all">("all");
  const [q, setQ] = useState("");
  const cats = useMemo(() => PREP_CATEGORIES.filter((c) => companies.some((x) => x.category === c)), [companies]);
  const needle = norm(q);
  const list = companies.filter(
    (c) => (cat === "all" || c.category === cat) && (!needle || norm(c.name).includes(needle) || norm(c.slug).includes(needle) || norm(CATEGORY_LABEL[c.category]).includes(needle)),
  );
  const shown = limit && !needle && cat === "all" ? list.slice(0, limit) : list;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative w-full sm:max-w-[360px]">
          <span className="sr-only">Search companies</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${companies.length} companies`}
            className="min-h-11 w-full border border-line-strong bg-bg pl-9 pr-3 text-[15px] text-fg placeholder:text-fg-4 focus:border-signal focus:outline-none"
          />
        </label>
        {!limit && (
          <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-1.5">
            {(["all", ...cats] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cat === c}
                onClick={() => setCat(c)}
                className={`min-h-9 border px-3 font-mono text-xs ${cat === c ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"}`}
              >
                {c === "all" ? `all · ${companies.length}` : CATEGORY_LABEL[c].toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </div>
      <ul className="m-0 grid list-none gap-2 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr))]">
        {shown.map((c) => (
          <li key={c.slug}>
            <Link href={c.href} className="group flex h-full items-start gap-3 border border-line bg-surface p-4 hover:border-fg-3">
              <CompanyLogo slug={c.slug} name={c.name} size={40} />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{CATEGORY_LABEL[c.category]}</span>
                <span className="font-display text-[19px] font-bold leading-tight tracking-[-0.02em] text-fg group-hover:text-signal-text">{c.name}</span>
                <span className="font-mono text-xs text-fg-3">
                  {c.questions} questions{c.reported ? <span className="text-signal-text"> · {c.reported} reported</span> : ""}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="m-0 text-[15px] text-fg-3">
          No company matches &ldquo;{q}&rdquo;. Try the{" "}
          <Link href="/learn/prep/questions" className="text-signal-text underline underline-offset-4">
            question bank
          </Link>
          , or a similar company in the same space.
        </p>
      )}
      {limit && !needle && list.length > shown.length && (
        <p className="m-0 font-mono text-xs text-fg-3">
          showing {shown.length} of {list.length} · search above or{" "}
          <Link href="/learn/prep/companies" className="text-signal-text underline underline-offset-4">
            see them all
          </Link>
        </p>
      )}
    </div>
  );
}
