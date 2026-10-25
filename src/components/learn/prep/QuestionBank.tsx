"use client";

/**
 * /learn/prep/questions: every company's questions merged by title, most-reported first. Filter by
 * type, company and evidence, or search; each row links the lessons that teach it and the companies
 * (a filled dot = reported with a source, an outline = likely from their products).
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { TYPE_LABEL, type BankQuestion, type QuestionType } from "@/lib/learn/prep/types";

const LABEL = "font-mono text-[11px] uppercase tracking-label";

export default function QuestionBank({ bank, companies }: { bank: BankQuestion[]; companies: { slug: string; name: string }[] }) {
  const [type, setType] = useState<QuestionType | "all">("all");
  const [company, setCompany] = useState("");
  const [reportedOnly, setReportedOnly] = useState(false);
  const [q, setQ] = useState("");
  const types = useMemo(() => (["system-design", "lld", "concept"] as QuestionType[]).filter((t) => bank.some((b) => b.type === t)), [bank]);
  const list = bank.filter(
    (b) =>
      (type === "all" || b.type === type) &&
      (!company || b.companies.some((c) => c.slug === company && (!reportedOnly || c.evidence === "reported"))) &&
      (!reportedOnly || b.companies.some((c) => c.evidence === "reported")) &&
      (!q || b.q.toLowerCase().includes(q.toLowerCase())),
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div role="group" aria-label="Question type" className="flex flex-wrap gap-1.5">
          {(["all", ...types] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => setType(t)}
              className={`min-h-9 border px-3 font-mono text-xs ${type === t ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"}`}
            >
              {t === "all" ? "all types" : TYPE_LABEL[t].toLowerCase()}
            </button>
          ))}
        </div>
        <select value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Company" className="min-h-10 border border-line-strong bg-bg px-3 text-[14px] text-fg">
          <option value="">all companies</option>
          {companies.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex min-h-10 items-center gap-2 text-[14px] text-fg-2">
          <input type="checkbox" checked={reportedOnly} onChange={(e) => setReportedOnly(e.target.checked)} className="h-4 w-4 accent-[var(--c-signal)]" />
          reported by candidates only
        </label>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search questions"
          aria-label="Search questions"
          className="min-h-10 w-full border border-line-strong bg-bg px-3 text-[15px] text-fg placeholder:text-fg-4 lg:ml-auto lg:w-64"
        />
      </div>
      <p className="m-0 font-mono text-xs text-fg-3">
        {list.length} question{list.length === 1 ? "" : "s"} · ● reported with a source · ○ likely, from their products
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.map((b) => {
          const rep = b.companies.filter((c) => c.evidence === "reported").length;
          return (
            <li key={b.key} className="flex flex-col gap-2 border border-line bg-surface p-4 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[16px] font-semibold leading-snug text-fg">{b.q}</span>
                <span className={`${LABEL} text-fg-3`}>
                  {TYPE_LABEL[b.type]}
                  {rep ? <span className="text-signal-text"> · reported at {rep}</span> : ""}
                </span>
              </div>
              <span className="flex flex-wrap gap-x-2.5 gap-y-1 text-[13px]">
                {b.companies.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/learn/prep/companies/${c.slug}`}
                    title={c.evidence === "reported" ? `Reported at ${c.name}` : `Likely at ${c.name}, from its products`}
                    className={c.evidence === "reported" ? "text-fg hover:text-signal-text" : "text-fg-3 hover:text-fg"}
                  >
                    {c.evidence === "reported" ? "●" : "○"} {c.name}
                  </Link>
                ))}
              </span>
              {b.links.length > 0 && (
                <span className="flex flex-wrap gap-x-3 gap-y-1">
                  {b.links.slice(0, 3).map((l) => (
                    <Link key={l.href} href={l.href} className="font-mono text-xs text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                      {l.code} · {l.title} →
                    </Link>
                  ))}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
