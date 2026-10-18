"use client";

/**
 * Reference numbers by section (latency, throughput, sizes, units, rules of thumb). Each table
 * names the lesson it is taught in (and the outside source the course relies on, where it does);
 * rows with a worked expression can send it to the calculator.
 */
import Link from "next/link";
import { useState } from "react";
import { SECTIONS, type RefTable, type Row } from "@/lib/learn/numbers/reference";
import { fmtTime } from "@/lib/learn/numbers/calc";

const MAX_NS = 150_000_000;
const MIN_NS = 0.5;

/** log-scale share of the latency range, 0..100 */
const barPct = (ns: number) => Math.max(1.5, (Math.log10(ns / MIN_NS) / Math.log10(MAX_NS / MIN_NS)) * 100);

export default function ReferenceTables({ onTry }: { onTry: (q: string) => void }) {
  const [human, setHuman] = useState(false);
  return (
    <section id="reference" aria-labelledby="ref-h" className="flex scroll-mt-24 flex-col gap-8">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          <span className="text-signal-text">02</span> · reference
        </span>
        <h2 id="ref-h" className="font-display text-[28px] font-extrabold leading-[1] tracking-[-0.035em] text-fg sm:text-[36px]">
          Numbers every engineer should know
        </h2>
        <nav aria-label="Reference sections" className="flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#ref-${s.id}`} className="inline-flex min-h-10 items-center border border-line px-3 font-mono text-[13px] text-fg-2 hover:border-fg-4 hover:text-fg">
              {s.title}
            </a>
          ))}
        </nav>
      </div>

      {SECTIONS.map((s) => (
        <div key={s.id} id={`ref-${s.id}`} className="flex scroll-mt-24 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{s.kicker}</span>
              <h3 className="m-0 font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-fg sm:text-[30px]">{s.title}</h3>
            </div>
            {s.id === "latency" && (
              <button type="button" aria-pressed={human} onClick={() => setHuman((h) => !h)} className={`inline-flex min-h-10 items-center border px-3 font-mono text-[12.5px] ${human ? "border-signal text-signal-text" : "border-line-strong text-fg-2 hover:text-fg"}`}>
                {human ? "back to real time" : "if an L1 hit took 1 second…"}
              </button>
            )}
          </div>
          <p className="m-0 max-w-[820px] text-[15px] leading-relaxed text-fg-2">{s.blurb}</p>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            {s.tables.map((t) => (
              <Table key={t.id} table={t} human={human && t.id === "latency-dean"} onTry={onTry} wide={t.id === "latency-dean"} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function Table({ table, human, onTry, wide }: { table: RefTable; human: boolean; onTry: (q: string) => void; wide: boolean }) {
  const hasBars = table.rows.some((r) => r.ns);
  const third = table.cols.length === 3 && !hasBars ? table.cols[2] : null;
  return (
    <figure id={table.id} className={`m-0 flex min-w-0 scroll-mt-24 flex-col border border-line bg-surface ${wide ? "lg:col-span-2" : ""}`}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
        <span className="text-[15px] font-semibold text-fg">{table.title}</span>
        {human && <span className="font-mono text-[11px] text-signal-text">scaled: 0.5 ns → 1 s</span>}
      </figcaption>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-2 font-mono text-[11px] font-normal uppercase tracking-label text-fg-3">
              {table.cols[0]}
            </th>
            <th scope="col" className="px-4 py-2 text-right font-mono text-[11px] font-normal uppercase tracking-label text-fg-3">
              {table.cols[1]}
              {third ? <span className="block normal-case tracking-normal text-fg-4">{third}</span> : null}
            </th>
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r) => (
            <RowView key={r.what} row={r} human={human} onTry={onTry} />
          ))}
        </tbody>
      </table>
      <div className="mt-auto flex flex-col gap-2 border-t border-line px-4 py-3">
        {table.note && <p className="m-0 text-[12.5px] leading-relaxed text-fg-3">{table.note}</p>}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {table.taught.map((t) => (
            <Link key={t.href} href={t.href} className="inline-flex min-h-9 items-center font-mono text-[12.5px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
              taught in {t.label} →
            </Link>
          ))}
        </div>
        {table.external && table.external.length > 0 && (
          <p className="m-0 text-[12px] leading-relaxed text-fg-3">
            Source{table.external.length > 1 ? "s" : ""}:{" "}
            {table.external.map((e, i) => (
              <span key={e.href}>
                {i > 0 && " · "}
                <a href={e.href} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-fg">
                  {e.label} ↗
                </a>
              </span>
            ))}
          </p>
        )}
      </div>
    </figure>
  );
}

function RowView({ row, human, onTry }: { row: Row; human: boolean; onTry: (q: string) => void }) {
  const value = human && row.ns ? fmtTime(row.ns * 2) : row.value;
  return (
    <tr className="border-b border-line align-top last:border-b-0">
      <th scope="row" className="px-4 py-2.5 text-[14px] font-normal leading-snug text-fg-2">
        {row.what}
        {row.ns !== undefined && (
          <span aria-hidden className="mt-1.5 block h-1.5 bg-surface-2">
            <span className="block h-1.5 bg-signal" style={{ width: `${barPct(row.ns)}%` }} />
          </span>
        )}
      </th>
      <td className="px-4 py-2.5 text-right">
        <span className={`block font-mono text-[13.5px] leading-snug text-fg ${value.length <= 16 ? "whitespace-nowrap" : ""}`}>{value}</span>
        {row.alt && <span className="block font-mono text-[12px] leading-snug text-fg-3">{row.alt}</span>}
        {row.calc && (
          <button type="button" onClick={() => onTry(row.calc!)} className="mt-1 inline-flex min-h-8 items-center font-mono text-[11.5px] text-signal-text underline decoration-line-strong underline-offset-2 hover:decoration-signal" aria-label={`Work it out in the calculator: ${row.calc}`}>
            work it out ↑
          </button>
        )}
      </td>
    </tr>
  );
}
