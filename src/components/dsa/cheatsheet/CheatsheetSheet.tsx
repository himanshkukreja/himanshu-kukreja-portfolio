"use client";

/**
 * One concept's pattern cheat sheet (/dsa/cheatsheets/<concept>): when to reach for it, the invariant, the pattern card,
 * the templates (in the learner's language: the same "dsa.lang" preference as the lessons' code tabs, switchable here),
 * complexity, the pitfalls and the edge cases to test. The blocks are the lesson's own (src/lib/dsa/cheatsheet.ts),
 * inside .course-content so they look as they do there; CourseEnhancer gives the code its copy buttons.
 * Printing (Print, or the browser's) gives one light page of just the sheet in the chosen language (dsa.css).
 */
import "../dsa.css";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Printer } from "lucide-react";
import styles from "@/components/learn/lesson/reader.module.css";
import { loadCourseEnhancer } from "@/lib/offline/lazy";
import { DSA_LANGS, DSA_LANG_LABEL } from "@/lib/dsa/types";
import type { Cheatsheet } from "@/lib/dsa/cheatsheet";
import { useLang } from "../concept/widgets";
import DsaCrumbs from "../DsaCrumbs";
import { track } from "@/lib/track";
import SaveOfflineButton from "@/components/offline/SaveOfflineButton";

const CourseEnhancer = dynamic(loadCourseEnhancer, { ssr: false });

const Html = ({ html, className = "" }: { html: string; className?: string }) => <div className={`course-content ${styles.content} dsa-cheat-html ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;

function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`dsa-cheat-sec flex flex-col gap-2.5 ${className}`}>
      <h2 className="m-0 font-mono text-[12px] font-semibold uppercase tracking-label text-signal-text">{title}</h2>
      {children}
    </section>
  );
}

/** The language switch: one choice for every template on the sheet (and the lessons' code tabs). */
export function LangSwitch({ className = "" }: { className?: string }) {
  const [lang, setLang] = useLang();
  return (
    <div role="radiogroup" aria-label="Code language" className={`dsa-noprint inline-flex border border-line-strong ${className}`}>
      {DSA_LANGS.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-10 px-3 font-mono text-[12px] ${lang === l ? "bg-signal font-semibold text-on-signal" : "text-fg-2 hover:bg-surface-2 hover:text-fg"}`}
        >
          {DSA_LANG_LABEL[l]}
        </button>
      ))}
    </div>
  );
}

export default function CheatsheetSheet({ s, lectureHref }: { s: Cheatsheet; lectureHref: string | null }) {
  const [lang] = useLang();
  const print = () => {
    track("dsa_cheatsheet_print", { concept: s.id, lang });
    window.print();
  };
  return (
    <main className="dsa-cheat mx-auto flex w-full max-w-[1240px] flex-col gap-7 px-4 pb-28 pt-8 sm:px-6 sm:pt-10" data-lang={lang}>
      <header className="flex flex-col gap-3">
        <div className="dsa-noprint">
          <DsaCrumbs items={[{ href: "/dsa", label: "Learn" }, { href: "/dsa/cheatsheets", label: "Cheat sheets" }, { label: s.title }]} />
        </div>
        <span className="font-mono text-[12px] uppercase tracking-label text-signal-text">
          {s.code} {s.moduleTitle} · cheat sheet
        </span>
        <h1 className="m-0 font-display text-[34px] font-extrabold leading-[1] tracking-[-0.03em] text-fg sm:text-[46px]">
          {s.title}
          <span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[760px] text-[16px] leading-relaxed text-fg-2">{s.summary}</p>
        <div className="dsa-noprint flex flex-wrap items-center gap-2">
          <LangSwitch />
          <button type="button" onClick={print} className="inline-flex min-h-10 items-center gap-2 border border-line-strong px-3 font-mono text-[12px] text-fg hover:border-signal">
            <Printer className="h-3.5 w-3.5" aria-hidden /> print
          </button>
          <Link href={`/dsa/concepts/${s.id}`} className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-[12px] text-fg hover:border-signal">
            read the lesson
          </Link>
          <SaveOfflineButton title={`Cheat sheet · ${s.title}`} kind="cheatsheet" />
          {lectureHref && (
            <Link href={lectureHref} className="inline-flex min-h-10 items-center border border-line-strong px-3 font-mono text-[12px] text-fg hover:border-signal">
              ▶ watch the lecture
            </Link>
          )}
        </div>
      </header>

      <div className="dsa-cheat-grid grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-7 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-7">
          {s.signals.length > 0 && (
            <Section title="Spot it: the words in the question">
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {s.signals.map((x) => (
                  <li key={x} className="border border-line-strong bg-surface px-2 py-1 font-mono text-[12.5px] text-fg-2">
                    {x}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {s.invariant && (
            <Section title="The invariant">
              <p className="m-0 border-l-[3px] border-signal bg-surface px-4 py-3 text-[15.5px] font-medium leading-relaxed text-fg">{s.invariant}</p>
            </Section>
          )}
          {s.patternHtml && (
            <Section title="The pattern">
              <Html html={s.patternHtml} />
            </Section>
          )}
          {s.complexityHtml && (
            <Section title="Complexity">
              <Html html={s.complexityHtml} />
            </Section>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-7">
          <Section title={`Template${s.templates.length === 1 ? "" : "s"} · ${DSA_LANG_LABEL[lang]}`}>
            <p className="dsa-noprint m-0 text-[13px] leading-snug text-fg-3">The lesson&rsquo;s templates, checked in all four languages against the same test cases.</p>
            {s.templates.map((t) => (
              <Html key={t.id} html={t.html} />
            ))}
          </Section>
        </div>
      </div>

      <div className="dsa-cheat-grid grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-7 lg:grid-cols-3">
        {s.pitfalls.length > 0 && (
          <Section title="Pitfalls" className="lg:col-span-2">
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {s.pitfalls.map((p, i) => (
                <li key={i} className="flex flex-col gap-1.5 border border-line bg-surface p-3">
                  <span className="text-[14.5px] font-semibold leading-snug text-fg">
                    <span className="mr-2 font-mono text-[12px] text-bad-text">✕ {i + 1}</span>
                    {p.title}
                  </span>
                  {p.html && <Html html={p.html} className="dsa-cheat-small" />}
                </li>
              ))}
            </ol>
          </Section>
        )}
        <div className="flex min-w-0 flex-col gap-7">
          {s.edges.length > 0 && (
            <Section title="Test these">
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {s.edges.map((e) => (
                  <li key={e} className="flex gap-2 text-[14.5px] leading-snug text-fg-2">
                    <span aria-hidden className="text-signal-text">□</span>
                    {e}
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {s.notFor.length > 0 && (
            <Section title="Not this pattern">
              {s.notFor.map((n) => (
                <div key={n.title} className="flex flex-col gap-1">
                  <span className="text-[14.5px] font-semibold text-fg">{n.title}</span>
                  <Html html={n.html} className="dsa-cheat-small" />
                </div>
              ))}
            </Section>
          )}
          {s.practice.length > 0 && (
            <Section title="Practise it" className="dsa-noprint">
              <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
                {s.practice.map((p) => (
                  <li key={p.id} className="bg-surface">
                    <Link href={`/dsa/problems/${p.id}`} className="flex min-h-11 items-center gap-2 px-3 py-2 text-[14px] text-fg hover:bg-surface-2">
                      <span className="min-w-0 flex-1">{p.title}</span>
                      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{p.level}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
      <p className="dsa-print-only m-0 font-mono text-[10px] text-fg-3">systemdesignmastery.dev/dsa/cheatsheets/{s.id}</p>
      {/* outside every .course-content, so it enhances all of the sheet's blocks (copy buttons) */}
      <CourseEnhancer lessonKey={`dsa-cheat/${s.id}`} />
    </main>
  );
}
