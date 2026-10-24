import type { Metadata } from "next";
import Link from "next/link";

// A "now" page (nownownow.com): what I'm focused on this month. Static; edit the list below and redeploy.
export const metadata: Metadata = {
  title: "Now · Himanshu Kukreja",
  description: "What Himanshu Kukreja is working on, building and writing this month.",
  alternates: { canonical: "/now" },
};

const UPDATED = "24 October 2026";

const H2 = "font-display text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-fg sm:text-[28px]";
const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

const SECTIONS: { id: string; label: string; title: string; items: { head: string; body: string; href?: string; cta?: string }[] }[] = [
  {
    id: "work",
    label: "day job",
    title: "Working",
    items: [{ head: "Senseloaf AI · senior software engineer, eng lead", body: "Leading engineering for an agentic hiring platform, since April 2026." }],
  },
  {
    id: "building",
    label: "side projects",
    title: "Building",
    items: [
      { head: "Chukta", body: "Free, ad-free bill splitting for friends in India, settled over UPI in one tap. In beta.", href: "https://getchukta.in", cta: "getchukta.in ↗" },
      { head: "Markdrop", body: "Publish markdown, AI docs and files as links that render.", href: "https://markdrop.in", cta: "markdrop.in ↗" },
    ],
  },
  {
    id: "writing",
    label: "teaching",
    title: "Writing",
    items: [
      {
        head: "System Design Mastery",
        body: "The free course: this month every lesson is getting a whole-lesson animated explainer you can play with narration, and every real-world number in the side quests was checked against its source.",
        href: "/learn/system-design-mastery",
        cta: "open the course →",
      },
      { head: "Case files", body: "A new real-world incident or design story every Monday.", href: "/stories", cta: "read the case files →" },
    ],
  },
  {
    id: "open",
    label: "availability",
    title: "Open to",
    items: [{ head: "Freelance backend work and system design reviews", body: "Limited availability: part-time, alongside my full-time role.", href: "/#contact", cta: "send a request →" }],
  },
];

export default function NowPage() {
  return (
    <main className="mx-auto flex w-full max-w-[880px] flex-col gap-8 px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      <header className="flex flex-col gap-3">
        <span className="font-mono text-xs text-fg-3">
          <span className="text-signal-text">$</span> cat ~/now.md
        </span>
        <h1 className="font-display text-[40px] font-extrabold leading-[1.02] tracking-tightest text-fg sm:text-[56px]">
          Now<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[60ch] text-[17px] leading-relaxed text-fg-2">What I&apos;m focused on this month. Updated {UPDATED}, in Bengaluru.</p>
      </header>
      {SECTIONS.map((s) => (
        <section key={s.id} aria-labelledby={`${s.id}-h`} className="flex flex-col gap-4 border-t border-line pt-6">
          <span className={LABEL}>{s.label}</span>
          <h2 id={`${s.id}-h`} className={H2}>
            {s.title}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-4 p-0">
            {s.items.map((it) => (
              <li key={it.head} className="flex flex-col gap-1.5">
                <span className="font-semibold text-fg">{it.head}</span>
                <span className="max-w-[68ch] text-[15px] leading-relaxed text-fg-2">{it.body}</span>
                {it.href &&
                  (it.href.startsWith("http") ? (
                    <a href={it.href} target="_blank" rel="noreferrer" className="font-mono text-xs text-signal-text hover:underline">
                      {it.cta}
                    </a>
                  ) : (
                    <Link href={it.href} className="font-mono text-xs text-signal-text hover:underline">
                      {it.cta}
                    </Link>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
