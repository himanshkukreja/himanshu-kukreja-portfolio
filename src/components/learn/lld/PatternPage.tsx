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
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { loadCourseEnhancer } from "@/lib/offline/lazy";
import LectureEntry from "@/components/learn/sidequest/LectureEntry";
import ArticleShorts from "@/components/learn/lesson/ArticleShorts";
import LessonFaq from "@/components/learn/ai/LessonFaq";
import { PATTERN_GROUPS, patternCode, type PatternMeta } from "@/lib/learn/lld/meta";
import type { CaseRow } from "@/lib/learn/lld/filters";
import type { PatternPageData } from "@/lib/learn/lld/pattern";

const CourseEnhancer = dynamic(loadCourseEnhancer, { ssr: false });
// code tabs and clips (the DSA widgets) load with the page's first figure of that kind
const SdmWidgets = dynamic(() => import("@/components/learn/lesson/SdmWidgets"), { ssr: false });
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

const Html = ({ html }: { html: string }) => <div className="sd-body" dangerouslySetInnerHTML={{ __html: html }} />;
const LINK = { color: "var(--c-signal-text)", fontWeight: 600 } as const;

export default function PatternPage({ pattern, data, written, cases, prev, next }: PatternPageProps) {
  const group = PATTERN_GROUPS.find((g) => g.id === pattern.group);
  const [side, setSide] = useState<"before" | "after">(data.before ? "before" : "after");
  const body = useRef<HTMLDivElement>(null);
  const hasBA = !!(data.before && data.after);
  const hasUml = !!(data.before || data.after);
  const code = patternCode(pattern);

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
          <span className="bg-signal px-2.5 py-1.5 font-semibold uppercase text-on-signal">{code} · {group?.label ?? "Pattern"}</span>
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
        <div ref={body} className="course-content" style={{ ["--reader-size" as string]: "16px" }}>
          {data.intro && <Html html={data.intro} />}

          <Slot title="The problem it solves" id="problem">
            <p style={{ margin: "0 0 8px", fontSize: 16, lineHeight: 1.55 }}>{pattern.problem}</p>
            {data.problem ? <Html html={data.problem} /> : !written && <Soon what="The full explanation" />}
          </Slot>

          <Slot title={hasBA ? "Before and after" : "The pattern"} id="pattern">
            {data.pattern && <Html html={data.pattern} />}
            {hasUml ? (
              <>
                {hasBA && (
                  <div className="lld-seg" role="group" aria-label="UML view">
                    {(["before", "after"] as const).map((k) => (
                      <button key={k} type="button" aria-pressed={side === k} onClick={() => setSide(k)}>
                        {k === "before" ? "Before the pattern" : "With the pattern"}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 12 }} role="region" aria-live="polite" aria-label={hasBA ? (side === "before" ? "UML before the pattern" : "UML with the pattern") : "Class diagram"}>
                  {data.before && <div hidden={hasBA && side !== "before"}><Html html={data.before} /></div>}
                  {data.after && <div hidden={hasBA && side !== "after"}><Html html={data.after} /></div>}
                </div>
              </>
            ) : (
              !data.pattern && <Soon what="The class diagram" />
            )}
          </Slot>

          <Slot title="In code" id="code">
            {data.code ? <Html html={data.code} /> : <p className="lld-note" style={{ margin: 0 }}>Python, Java, C++ and JavaScript versions are not written yet.</p>}
          </Slot>

          {data.deep.map((x) => (
            <Slot key={x.title} title={x.title}>
              <Html html={x.html} />
            </Slot>
          ))}

          <Slot title="When not to use it" id="when-not">
            {data.notUse ? <Html html={data.notUse} /> : <Soon what="This section" />}
          </Slot>

          <Slot title="Case studies that use it" id="used-in">
            {data.cases && <Html html={data.cases} />}
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
              <p className="lld-note" style={{ margin: 0 }}>{data.cases ? "The table above says where it would fit." : "No case study uses this pattern yet."}</p>
            )}
          </Slot>

          {data.closing.map((x) => (
            <Slot key={x.title} title={x.title}>
              <Html html={x.html} />
            </Slot>
          ))}

          <div className="lld-groups" style={{ marginTop: 20 }}>
            <Slot title="Lab" id="lab">
              {data.lab ? (
                <p style={{ margin: 0 }}>
                  <Link href={data.lab.href} style={LINK}>{data.lab.title}</Link>
                  <span className="lld-note"> · {data.lab.minutes} min · {data.lab.languages.join(", ")}</span>
                </p>
              ) : (
                <Soon what="The lab" />
              )}
            </Slot>
            <Slot title="Lecture" id="lecture">{data.lecture ? <Link href={data.lecture.href} style={LINK}>Watch the {data.lecture.minutes}-minute lecture</Link> : <Soon what="The lecture" />}</Slot>
            <Slot title="Clips" id="clips">{data.shorts ? <p style={{ margin: 0 }}>{data.shorts.items.length} short clip{data.shorts.items.length === 1 ? "" : "s"} below.</p> : <Soon what="The clips" />}</Slot>
          </div>

          {data.shorts && <ArticleShorts of={data.shorts.of} shorts={data.shorts.items} />}

          <Slot title="Quick check" id="quiz">{data.quiz ? <Html html={data.quiz} /> : <Soon what="The quiz" />}</Slot>

          {written && (
            <div style={{ marginTop: 20 }}>
              <LessonFaq week="low-level-design" slug={data.lessonId} />
            </div>
          )}
          <SdmWidgets contentRef={body} clips={data.clips} />
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
