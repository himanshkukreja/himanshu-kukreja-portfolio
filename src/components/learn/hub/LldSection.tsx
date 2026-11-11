"use client";

/**
 * The course home's "Low-level design" track (owner, 11 Nov 2026: LLD and the design patterns get their own place
 * beside the course): six cards in the side quests' style, the five design-pattern parts and the case studies, each
 * with its range, what it covers, the reader's progress and the next lesson to open. The full lists live on the LLD
 * home. map.lld holds both kinds (dp-NN first, then lld-NN; course.ts lessonOf codes them DP-NN and LLD-NN).
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
const num = (l: CourseLesson) => parseInt(l.slug.match(/^(?:dp|lld)-(\d+)/)?.[1] || "0", 10);
// "The Strategy Pattern" → "Strategy"; "SOLID, Part 1: …" → "SOLID, Part 1"; "Design a Parking Lot" → "Parking Lot"
const short = (t: string) => t.replace(/, and why .*$/i, "").replace(/^The\s+/, "").replace(/\s+Pattern$/, "").replace(/^Design (an? )?/i, "").split(":")[0].trim();
const covers = (xs: CourseLesson[], shown = 4) => {
  const names = xs.slice(0, shown).map((l) => short(l.title));
  return xs.length > shown ? `${names.join(", ")} and ${xs.length - shown} more` : names.join(", ").replace(/, ([^,]*)$/, " and $1");
};

export default function LldSection({ lld, lessons }: { lld: CourseLesson[]; lessons: Status }) {
  const done = (l: CourseLesson) => lessons[lessonKey(l.week, l.slug)]?.status === "completed";
  const patterns = lld.filter((l) => l.slug.startsWith("dp-"));
  const cases = lld.filter((l) => l.slug.startsWith("lld-"));
  const groups = [
    ...PARTS.map((p) => ({ title: p.title, kind: "Design patterns", items: patterns.filter((l) => num(l) >= p.from && num(l) <= p.to) })),
    { title: "Case studies", kind: "Interview rounds", items: cases },
  ].filter((g) => g.items.length);
  if (!groups.length) return null;
  const total = patterns.length + cases.length;
  const finished = [...patterns, ...cases].filter(done).length;

  return (
    <section aria-labelledby="lld-h" className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="lld-h" className="font-display text-[34px] font-bold tracking-[-0.03em] text-fg sm:text-[40px]">
          Low-level design
        </h2>
        <span className="text-[15px] text-fg-3">
          {patterns.length} design patterns, then {cases.length} machine-coding rounds. {finished}/{total} done.{" "}
          <Link href="/low-level-design" className="font-mono text-[13px] text-signal-text underline underline-offset-4">
            LLD home →
          </Link>
        </span>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(260px,100%),1fr))] gap-2">
        {groups.map((g) => {
          const n = g.items.filter(done).length;
          const next = g.items.find((l) => !done(l));
          const all = n === g.items.length;
          const first = g.items[0];
          const last = g.items[g.items.length - 1];
          const range = `${first.code}${g.items.length > 1 ? `–${String(num(last)).padStart(2, "0")}` : ""}`;
          const pct = Math.round((n / g.items.length) * 100);
          return (
            <Link
              key={g.title}
              href={(next ?? first).href}
              className={`group flex flex-col gap-2.5 p-4 hover:border-fg-4 sm:min-h-[188px] sm:p-[18px] ${all ? "border border-line-strong bg-surface-2" : "border border-line bg-bg"}`}
            >
              <span className="flex items-start justify-between gap-3 font-mono text-[11px] uppercase tracking-label text-fg-3">
                <span>{g.kind}</span>
                <span>{range}</span>
              </span>
              <span className="font-display text-[22px] font-bold leading-[1.05] tracking-[-0.02em] text-fg">{g.title}</span>
              <span className="text-[14px] leading-snug text-fg-2">{covers(g.items)}</span>
              <span className="mt-auto flex flex-col gap-2 pt-1">
                <span aria-hidden className="h-1 w-full bg-surface-2">
                  <span className="block h-full bg-signal" style={{ width: `${pct}%` }} />
                </span>
                <span className="flex items-center justify-between gap-2 font-mono text-xs">
                  <span className={`min-w-0 truncate ${all ? "text-fg" : "text-signal-text"}`}>
                    {all ? "COMPLETED ✓" : n ? `NEXT · ${short(next!.title)}` : `START · ${short(first.title)}`}
                  </span>
                  <span className="shrink-0 text-fg-3">
                    {n}/{g.items.length}
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
