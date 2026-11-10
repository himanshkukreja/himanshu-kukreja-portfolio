"use client";

/**
 * The design-pattern page template (/low-level-design/patterns/<slug>): the problem it solves, a
 * before/after UML toggle, code in four languages, when NOT to use it, the case studies that use it,
 * and slots for a lab, a lecture, clips and a quiz. Every slot is optional: a pattern whose lesson is
 * not written yet still shows the one-line problem and the case studies that use it, and says plainly
 * what is coming. The lesson's shape is documented in src/lib/learn/lld/pattern-format.ts.
 */
import "@/app/learn/course-content.css";
import "@/app/learn/course-blocks.css";
import "./lld.css";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { loadCourseEnhancer } from "@/lib/offline/lazy";
import LectureEntry from "@/components/learn/sidequest/LectureEntry";
import ArticleShorts from "@/components/learn/lesson/ArticleShorts";
import { LLD_LANGS, type LldLang } from "@/lib/learn/lld/steps";
import { PATTERN_GROUPS, type PatternMeta } from "@/lib/learn/lld/meta";
import type { CaseRow } from "@/lib/learn/lld/filters";
import type { PatternPageData } from "@/lib/learn/lld/pattern";

const CourseEnhancer = dynamic(loadCourseEnhancer, { ssr: false });
const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

export type PatternPageProps = {
  pattern: PatternMeta;
  /** the lesson's slots (every one may be empty) */
  data: PatternPageData;
  /** a lesson file exists for this pattern */
  written: boolean;
  cases: CaseRow[];
  prev: { slug: string; name: string } | null;
  next: { slug: string; name: string } | null;
};

function Slot({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section className="lld-box" id={id} aria-label={title}>
      <p className="lld-label">{title}</p>
      {children}
    </section>
  );
}

const Soon = ({ what }: { what: string }) => <p className="lld-note" style={{ margin: 0 }}>{what} is not written yet. It will appear here when it is.</p>;

export default function PatternPage({ pattern, data, written, cases, prev, next }: PatternPageProps) {
  const group = PATTERN_GROUPS.find((g) => g.id === pattern.group);
  const [side, setSide] = useState<"before" | "after">("before");
  const have = LLD_LANGS.filter((l) => data.code[l.id]);
  const [lang, setLang] = useState<LldLang>(have[0]?.id ?? "python");
  const hasBA = !!(data.before || data.after);

  return (
    <main className="pb-16">
      <section className="mx-auto max-w-[1100px] px-4 pb-5 pt-2 sm:px-6 sm:pt-4 lg:pt-7">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 font-mono text-[12px] sm:text-[13px]">
          <Link href="/" className="py-3 text-fg-3 hover:text-fg">course</Link>
          <span aria-hidden className="text-line-strong">›</span>
          <Link href="/low-level-design" className="py-3 text-fg-3 hover:text-fg">Low-level design</Link>
          <span aria-hidden className="text-line-strong">›</span>
          <Link href="/low-level-design#patterns" className="py-3 text-fg-3 hover:text-fg">Design patterns</Link>
          <span aria-hidden className="text-line-strong">›</span>
          <span aria-current="page" className="text-fg">{pattern.name}</span>
        </nav>
        <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs tracking-[0.06em]">
          <span className="bg-signal px-2.5 py-1.5 font-semibold uppercase text-on-signal">{group?.label ?? "Pattern"}</span>
          {!written && <span className="border border-line-strong px-2.5 py-1.5 text-fg-2">COMING SOON</span>}
          {cases.length > 0 && <span className="border border-line-strong px-2.5 py-1.5 text-fg-2">USED IN {cases.length} CASE {cases.length === 1 ? "STUDY" : "STUDIES"}</span>}
        </div>
        <h1 className="m-0 mt-3 break-words font-display text-[clamp(30px,8.6vw,46px)] font-extrabold leading-[0.95] tracking-[-0.04em] lg:text-[clamp(40px,5.6vw,76px)] lg:leading-[0.9]">
          {data.title ?? pattern.name}
          <span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 mt-2 max-w-[680px] text-[15px] leading-snug text-fg-2 sm:text-base lg:text-lg lg:leading-relaxed">{data.deck ?? pattern.problem}</p>
      </section>

      <div className="mx-auto max-w-[1100px] px-4 sm:px-6">
        {data.lecture && <LectureEntry lecture={data.lecture} what="This pattern" quest={false} className="mb-6" />}
        <div className="course-content" style={{ ["--reader-size" as string]: "16px" }}>
          <Slot title="The problem it solves">
            <p style={{ margin: "0 0 8px", fontSize: 16, lineHeight: 1.55 }}>{pattern.problem}</p>
            {data.problem ? <div className="sd-body" dangerouslySetInnerHTML={{ __html: data.problem }} /> : !written && <Soon what="The full explanation" />}
          </Slot>

          <Slot title="Before and after" id="before-after">
            {hasBA ? (
              <>
                <div className="lld-seg" role="group" aria-label="UML view">
                  {(["before", "after"] as const).map((k) => (
                    <button key={k} type="button" aria-pressed={side === k} disabled={!data[k]} onClick={() => setSide(k)}>
                      {k === "before" ? "Before the pattern" : "With the pattern"}
                      {!data[k] && <small>soon</small>}
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 12 }} role="region" aria-live="polite" aria-label={side === "before" ? "UML before the pattern" : "UML with the pattern"}>
                  <div hidden={side !== "before"} className="sd-body" dangerouslySetInnerHTML={{ __html: data.before }} />
                  <div hidden={side !== "after"} className="sd-body" dangerouslySetInnerHTML={{ __html: data.after }} />
                </div>
              </>
            ) : (
              <Soon what="The before and after UML" />
            )}
          </Slot>

          <Slot title="In code">
            <div className="lld-seg" role="group" aria-label="Code language">
              {LLD_LANGS.map((l) => (
                <button key={l.id} type="button" aria-pressed={!!data.code[l.id] && lang === l.id} disabled={!data.code[l.id]} onClick={() => setLang(l.id)}>
                  {l.label}
                  {!data.code[l.id] && <small>soon</small>}
                </button>
              ))}
            </div>
            {have.length ? (
              <div style={{ marginTop: 12 }} className="sd-body" dangerouslySetInnerHTML={{ __html: data.code[lang] ?? data.code[have[0].id] ?? "" }} />
            ) : (
              <p className="lld-note">Python, Java, C++ and JavaScript versions are not written yet.</p>
            )}
          </Slot>

          <Slot title="When not to use it">
            {data.notUse ? <div className="sd-body" dangerouslySetInnerHTML={{ __html: data.notUse }} /> : <Soon what="This section" />}
          </Slot>

          <Slot title="Case studies that use it" id="used-in">
            {cases.length ? (
              <ul className="lld-chips" style={{ display: "grid", gap: 8 }}>
                {cases.map((c) => (
                  <li key={c.slug}>
                    <Link href={c.href} className="lld-chip" style={{ width: "100%", justifyContent: "space-between", gap: 12, minHeight: 44 }}>
                      <span>{c.name}</span>
                      <small style={{ margin: 0 }}>{c.difficulty}</small>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="lld-note" style={{ margin: 0 }}>No case study uses this pattern yet.</p>
            )}
          </Slot>

          <div className="lld-groups" style={{ marginTop: 20 }}>
            <Slot title="Lab">
              {data.lab ? (
                <p style={{ margin: 0 }}>
                  <Link href={data.lab.href} style={{ color: "var(--c-signal-text)", fontWeight: 600 }}>{data.lab.title}</Link>
                  <span className="lld-note"> · {data.lab.minutes} min · {data.lab.languages.join(", ")}</span>
                </p>
              ) : (
                <Soon what="The lab" />
              )}
            </Slot>
            <Slot title="Lecture">{data.lecture ? <Link href={data.lecture.href} style={{ color: "var(--c-signal-text)", fontWeight: 600 }}>Watch the {data.lecture.minutes}-minute lecture</Link> : <Soon what="The lecture" />}</Slot>
            <Slot title="Clips">{data.shorts ? <p style={{ margin: 0 }}>{data.shorts.items.length} short clip{data.shorts.items.length === 1 ? "" : "s"} below.</p> : <Soon what="The clips" />}</Slot>
          </div>

          {data.shorts && <ArticleShorts of={data.shorts.of} shorts={data.shorts.items} />}

          <Slot title="Quick check">{data.quiz ? <div className="sd-body" dangerouslySetInnerHTML={{ __html: data.quiz }} /> : <Soon what="The quiz" />}</Slot>

          {data.extra.map((x) => (
            <Slot key={x.title} title={x.title}>
              <div className="sd-body" dangerouslySetInnerHTML={{ __html: x.html }} />
            </Slot>
          ))}
          <CourseEnhancer lessonKey={`patterns/${pattern.slug}`} />
        </div>

        <nav aria-label="More patterns" className="mt-8 flex flex-wrap justify-between gap-3 border-t border-line pt-4">
          {prev ? (
            <Link href={`/low-level-design/patterns/${prev.slug}`} className="min-h-11 py-2 text-fg-2 hover:text-fg">
              <span className={LABEL}>Previous</span>
              <br />‹ {prev.name}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/low-level-design/patterns/${next.slug}`} className="min-h-11 py-2 text-right text-fg-2 hover:text-fg">
              <span className={LABEL}>Next</span>
              <br />{next.name} ›
            </Link>
          )}
        </nav>
      </div>
    </main>
  );
}
