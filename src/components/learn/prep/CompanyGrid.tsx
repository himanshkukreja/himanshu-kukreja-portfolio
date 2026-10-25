"use client";

/** Companies with a category filter and a name search (/learn/prep/companies, and a short form on the Prep hub). */
import Link from "next/link";
import { useMemo, useState } from "react";
import { CATEGORY_LABEL, PREP_CATEGORIES, type CompanySummary, type PrepCategory } from "@/lib/learn/prep/types";

export default function CompanyGrid({ companies, limit }: { companies: CompanySummary[]; limit?: number }) {
  const [cat, setCat] = useState<PrepCategory | "all">("all");
  const [q, setQ] = useState("");
  const cats = useMemo(() => PREP_CATEGORIES.filter((c) => companies.some((x) => x.category === c)), [companies]);
  const list = companies.filter((c) => (cat === "all" || c.category === cat) && (!q || c.name.toLowerCase().includes(q.toLowerCase())));
  const shown = limit ? list.slice(0, limit) : list;
  return (
    <div className="flex flex-col gap-4">
      {!limit && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a company"
            aria-label="Find a company"
            className="min-h-10 w-full border border-line-strong bg-bg px-3 text-[15px] text-fg placeholder:text-fg-4 sm:w-64"
          />
        </div>
      )}
      <ul className="m-0 grid list-none gap-2 p-0 [grid-template-columns:repeat(auto-fill,minmax(min(220px,100%),1fr))]">
        {shown.map((c) => (
          <li key={c.slug}>
            <Link href={c.href} className="group flex h-full flex-col gap-1.5 border border-line bg-surface p-4 hover:border-fg-3">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{CATEGORY_LABEL[c.category]}</span>
              <span className="font-display text-[20px] font-bold leading-tight tracking-[-0.02em] text-fg group-hover:text-signal-text">{c.name}</span>
              <span className="mt-auto font-mono text-xs text-fg-3">
                {c.questions} questions{c.reported ? <span className="text-signal-text"> · {c.reported} reported</span> : ""}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="m-0 text-[15px] text-fg-3">No company matches that.</p>}
    </div>
  );
}
