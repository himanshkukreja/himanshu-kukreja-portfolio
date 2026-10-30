"use client";

/** "Check against lesson": what matches, what doesn't, what's missing (each with its lesson section), and what the lesson doesn't cover. */
import Link from "next/link";
import AiText from "@/components/learn/ai/AiText";
import type { CheckItem } from "@/lib/ai/notes";

export type CheckData = { summary: string; items: CheckItem[]; raw?: string; lesson: { title: string; href: string } };

const GROUPS: { kind: CheckItem["kind"]; title: string; mark: string; tone: string }[] = [
  { kind: "wrong", title: "Doesn't match the lesson", mark: "✕", tone: "text-bad-text" },
  { kind: "missing", title: "Missing from your notes", mark: "+", tone: "text-signal-text" },
  { kind: "right", title: "Matches the lesson", mark: "✓", tone: "text-ok" },
  { kind: "outside", title: "Not in this lesson", mark: "·", tone: "text-fg-3" },
];

export default function CheckPanel({ data }: { data: CheckData }) {
  const by = (k: CheckItem["kind"]) => data.items.filter((x) => x.kind === k);
  return (
    <section aria-label="Your notes checked against the lesson" className="flex flex-col gap-3">
      <h3 className="m-0 font-mono text-[11px] uppercase tracking-label text-signal-text">checked against the lesson</h3>
      {data.summary && <p className="m-0 text-[14.5px] leading-relaxed text-fg">{data.summary}</p>}
      {data.raw && <AiText text={data.raw} className="text-[14.5px]" />}
      {GROUPS.map((g) => {
        const items = by(g.kind);
        if (!items.length) return null;
        return (
          <div key={g.kind} className="flex flex-col gap-2 border-t border-line pt-3">
            <h4 className={`m-0 flex items-center gap-2 font-mono text-[11px] uppercase tracking-label ${g.tone}`}>
              <span aria-hidden className="font-mono">
                {g.mark}
              </span>
              {g.title} <span className="text-fg-4">{items.length}</span>
            </h4>
            <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
              {items.map((x, i) => (
                <li key={i} className="flex flex-col gap-1 text-[14px] leading-relaxed text-fg-2">
                  <span className={g.kind === "wrong" ? "text-fg" : ""}>{x.note}</span>
                  {x.lesson && (
                    <span>
                      <strong className="font-semibold text-fg">The lesson says:</strong> {x.lesson}
                    </span>
                  )}
                  {x.quote && <q className="border-l-2 border-line-strong pl-2 text-[13px] italic text-fg-3">{x.quote}</q>}
                  {x.section ? (
                    <span className="self-start border border-line px-1.5 py-0.5 font-mono text-[11px] text-fg-3">§ {x.section}</span>
                  ) : (
                    g.kind === "outside" && <span className="font-mono text-[11px] text-fg-4">not wrong: this lesson just doesn&apos;t cover it</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {!data.items.length && !data.raw && <p className="m-0 text-[14px] text-fg-2">Nothing on this page could be checked against the lesson.</p>}
      <Link href={data.lesson.href} className="inline-flex min-h-10 items-center self-start text-[14px] font-semibold text-signal-text [@media(pointer:coarse)]:min-h-11">
        Open {data.lesson.title} ›
      </Link>
    </section>
  );
}
