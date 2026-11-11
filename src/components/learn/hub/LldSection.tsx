"use client";

/**
 * The course home's "Low-level design" part (owner, 11 Nov 2026: LLD and the design patterns get their own section,
 * not just a list inside prep): the 28 design-pattern lessons in their five parts, then the 22 case studies, with the
 * reader's progress. map.lld holds both (dp-NN first, then lld-NN; course.ts lessonOf codes them DP-NN and LLD-NN).
 */
import Link from "next/link";
import type { CourseLesson } from "@/lib/learn/types";
import { lessonKey } from "@/lib/learn/types";

/** The plan's five parts, by lesson number (docs/design-patterns/design-patterns-plan.md, section 2). */
const PARTS: { title: string; from: number; to: number }[] = [
  { title: "Foundations", from: 1, to: 5 },
  { title: "Creational", from: 6, to: 9 },
  { title: "Structural", from: 10, to: 15 },
  { title: "Behavioural", from: 16, to: 24 },
  { title: "In practice", from: 25, to: 28 },
];

type Status = Record<string, { status?: string } | undefined>;
const num = (l: CourseLesson) => parseInt(l.slug.match(/^dp-(\d+)/)?.[1] || "0", 10);
// "The Strategy Pattern" → "Strategy"; the long in-practice titles keep their first clause
const short = (t: string) => t.replace(/^The\s+/, "").replace(/\s+Pattern$/, "").split(":")[0];

export default function LldSection({ lld, lessons }: { lld: CourseLesson[]; lessons: Status }) {
  const patterns = lld.filter((l) => l.slug.startsWith("dp-"));
  const cases = lld.filter((l) => l.slug.startsWith("lld-"));
  if (!patterns.length && !cases.length) return null;
  const done = (l: CourseLesson) => lessons[lessonKey(l.week, l.slug)]?.status === "completed";
  const count = (xs: CourseLesson[]) => xs.filter(done).length;

  const chip = (l: CourseLesson, label: string) => (
    <Link
      key={l.slug}
      href={l.href}
      className={`inline-flex min-h-9 items-center gap-2 border px-2.5 text-[13px] hover:border-fg-4 ${done(l) ? "border-line-strong bg-surface-2 text-fg" : "border-line bg-bg text-fg-2"}`}
    >
      <span className="font-mono text-[10px] tracking-label text-fg-3">{l.code}</span>
      <span>{label}</span>
      {done(l) && (
        <span aria-label="completed" className="text-signal-text">
          ✓
        </span>
      )}
    </Link>
  );

  return (
    <section aria-labelledby="lld-h" className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="lld-h" className="font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
          Low-level design
        </h2>
        <span className="text-[15px] text-fg-3">
          Design patterns first, then the machine-coding rounds that use them.{" "}
          <Link href="/low-level-design" className="font-mono text-[13px] text-signal-text underline underline-offset-4">
            LLD home →
          </Link>
        </span>
      </div>

      {patterns.length > 0 && (
        <div className="flex flex-col gap-4 border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">Design patterns</h3>
            <span className="font-mono text-[12px] text-fg-3">
              {count(patterns)}/{patterns.length} done · code in Python, Java, C++ and JavaScript
            </span>
          </div>
          {PARTS.map((p) => {
            const xs = patterns.filter((l) => num(l) >= p.from && num(l) <= p.to);
            if (!xs.length) return null;
            return (
              <div key={p.title} className="flex flex-col gap-2">
                <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
                  {p.title} · {count(xs)}/{xs.length}
                </span>
                <div className="flex flex-wrap gap-1.5">{xs.map((l) => chip(l, short(l.title)))}</div>
              </div>
            );
          })}
        </div>
      )}

      {cases.length > 0 && (
        <div className="flex flex-col gap-3 border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">Case studies</h3>
            <span className="font-mono text-[12px] text-fg-3">
              {count(cases)}/{cases.length} done · each a 7-step interview walkthrough
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">{cases.map((l) => chip(l, l.title.replace(/^Design (an? )?/i, "")))}</div>
        </div>
      )}
    </section>
  );
}
