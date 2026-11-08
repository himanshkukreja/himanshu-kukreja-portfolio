/**
 * DSA Mastery's coming-soon page (/dsa until launch): the course's design system (fonts, square cards, mono
 * labels, the reading themes) with DSA Mastery's teal in place of the orange (.dsa-theme, globals.css).
 * Sections: hero + waitlist, the 6S Loop, a Kestrel scenario with a predict-the-step demo, the six worlds,
 * the platform, the bridge to System Design Mastery, and the FAQ. Server-rendered; the waitlist card, the
 * demo and the code tabs are client islands.
 */
import Link from "next/link";
import { DsaMark } from "@/components/dsa/DsaMark";
import WaitlistCard from "./WaitlistCard";
import PredictStep from "./PredictStep";
import CodeTabs from "./CodeTabs";
import { BRIDGES, CAST, FAQ, FEATURES, LOOP, WORLDS } from "./content";

function SectionHead({ id, label, title, children }: { id: string; label: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex max-w-[760px] flex-col gap-3">
      <span className="font-mono text-xs uppercase tracking-label text-signal-text">{label}</span>
      <h2 id={id} className="m-0 font-display text-[32px] font-bold leading-[1.02] tracking-[-0.03em] text-fg sm:text-[44px]">
        {title}
        <span className="text-signal-text">.</span>
      </h2>
      {children && <p className="m-0 text-[16px] leading-relaxed text-fg-2 sm:text-[17px]">{children}</p>}
    </div>
  );
}

function Fact({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-baseline gap-2 bg-bg px-4 py-3 sm:grow sm:px-[18px]">
      <span className="font-mono text-[22px] font-semibold text-fg">{n}</span>
      <span className="text-[13px] text-fg-3">{label}</span>
    </div>
  );
}

/** The six worlds as a wired track (the course's world-map language), the first one lit. */
function WorldTrack() {
  return (
    <ol aria-hidden className="m-0 flex list-none items-center p-0">
      {WORLDS.map((w, i) => (
        <li key={w.n} className="flex min-w-0 flex-1 items-center last:flex-none">
          <span
            className={`grid h-10 w-11 shrink-0 place-items-center border-2 font-mono text-[15px] font-semibold sm:h-12 sm:w-14 sm:text-[17px] ${
              i === 0 ? "border-signal bg-signal text-on-signal" : "border-line-strong bg-bg text-fg-3"
            }`}
          >
            {w.n}
          </span>
          {i < WORLDS.length - 1 && <span className={`h-0.5 min-w-2 flex-1 ${i === 0 ? "bg-signal" : "bg-line-strong"}`} />}
        </li>
      ))}
    </ol>
  );
}

export default function DsaComingSoon() {
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1320px] flex-col gap-16 px-4 pb-28 pt-8 sm:gap-24 sm:px-6 sm:pt-14">
        {/* Hero */}
        <section aria-labelledby="dsa-h" className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-14">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <DsaMark className="h-9 w-9 sm:h-11 sm:w-11" />
              <span className="font-mono text-xs uppercase tracking-label text-signal-text">Coming soon · a new course on System Design Mastery</span>
            </div>
            <h1 id="dsa-h" className="m-0 font-display text-[clamp(52px,8vw,116px)] font-extrabold leading-[0.88] tracking-tightest text-fg">
              DSA Mastery<span className="text-signal-text">.</span>
            </h1>
            <p className="m-0 max-w-[680px] font-display text-[24px] font-bold leading-[1.15] tracking-[-0.02em] text-fg sm:text-[32px]">
              Data structures and algorithms, learned through real product engineering.
            </p>
            <p className="m-0 max-w-[640px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
              Every concept starts as a task at Kestrel, a fictional global tech company, and ends with you explaining the pattern in your own words. Built for placements and
              interviews, fundamentals from zero, and competitive programming.
            </p>
            <div className="grid grid-cols-2 gap-px self-stretch border border-line bg-line sm:flex sm:flex-wrap sm:self-start">
              <Fact n="6" label="worlds" />
              <Fact n="6" label="steps per concept" />
              <Fact n="4" label="languages" />
              <Fact n="1" label="account for both courses" />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
              <a href="#loop" className="inline-flex min-h-10 items-center font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4 hover:decoration-signal">
                how it teaches →
              </a>
              <Link href="/" className="inline-flex min-h-10 items-center font-mono text-[13px] text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
                start System Design Mastery today
              </Link>
            </div>
          </div>
          <WaitlistCard source="dsa-soon" />
        </section>

        {/* The 6S Loop */}
        <section aria-labelledby="loop" className="flex scroll-mt-24 flex-col gap-8">
          <SectionHead id="loop" label="The method" title="Every concept runs the 6S Loop">
            Six beats, the same in every lesson and lecture. You meet the problem before the solution, measure a first attempt at production scale, and leave able to explain
            the idea, not just recall it.
          </SectionHead>
          <ol className="m-0 grid list-none grid-cols-1 gap-px border border-line bg-line p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {LOOP.map((b) => (
              <li key={b.n} className="flex flex-col gap-3 bg-surface p-5">
                <span className="font-mono text-xs text-signal-text">{b.n}</span>
                <span className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-fg">{b.name}</span>
                <span className="text-[14px] leading-relaxed text-fg-2">{b.what}</span>
                <span className="mt-auto border-t border-line pt-3 font-mono text-[11px] uppercase tracking-label text-fg-3">you · {b.you}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Kestrel scenario + demo */}
        <section aria-labelledby="kestrel-h" className="flex flex-col gap-8">
          <SectionHead id="kestrel-h" label="Kestrel" title="Real product problems, a professional team">
            Problems are set across Kestrel&apos;s product lines: Shop, Rides, Stream, Pay, Freight, Search, Chat, Maps and more. A small team carries each lesson, with short
            workplace dialogue that serves the explanation.
          </SectionHead>
          <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Module 5 · sliding window · Kestrel Stream</span>
              <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
                {CAST.map((c) => (
                  <li key={c.name} className="flex gap-3.5 bg-surface p-4 sm:p-5">
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center border border-line-strong bg-bg font-mono text-[13px] font-semibold text-signal-text">
                      {c.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="text-[14px] font-semibold text-fg">
                        {c.name} <span className="font-normal text-fg-3">· {c.role}</span>
                      </span>
                      <span className="text-[15px] leading-relaxed text-fg-2">{c.line}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <CodeTabs />
            </div>
            <PredictStep />
          </div>
        </section>

        {/* Worlds */}
        <section aria-labelledby="worlds-h" className="flex flex-col gap-8">
          <SectionHead id="worlds-h" label="The map" title="Six worlds, one problem bank">
            Each world is a Kestrel division with its own map of roads, concept stops, checkpoints, gates and bosses. A problem solved anywhere counts in every world that
            contains it, and switching worlds is free.
          </SectionHead>
          <WorldTrack />
          <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {WORLDS.map((w, i) => (
              <li key={w.n} className={`flex flex-col gap-3 border bg-surface p-5 ${i === 0 ? "border-signal" : "border-line"}`}>
                <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">
                  World {w.n} · {w.track}
                </span>
                <span className="font-display text-[26px] font-bold leading-none tracking-[-0.03em] text-fg">{w.name}</span>
                <span className="font-mono text-xs text-fg-3">{w.division}</span>
                <span className="text-[14px] leading-relaxed text-fg-2">{w.body}</span>
                <span className="mt-auto self-start border border-line-strong px-2 py-0.5 font-mono text-[10px] uppercase tracking-label text-fg-3">{w.status}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* Platform */}
        <section aria-labelledby="platform-h" className="flex flex-col gap-8">
          <SectionHead id="platform-h" label="The platform" title="Built for practice, with AI at the core">
            Learn, practise and revise in one place. AI plans, curates and coaches, while problem selection stays rule-based and the solutions stay yours.
          </SectionHead>
          <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <li key={f.tag} className="flex flex-col gap-3 border border-line bg-surface p-5">
                <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{f.tag}</span>
                <span className="font-display text-[22px] font-bold leading-[1.08] tracking-[-0.02em] text-fg">{f.title}</span>
                <span className="text-[14px] leading-relaxed text-fg-2">{f.body}</span>
                <ul className="m-0 mt-auto flex list-none flex-col gap-1.5 border-t border-line p-0 pt-3">
                  {f.points.map((p) => (
                    <li key={p} className="flex gap-2 text-[13px] leading-snug text-fg-2">
                      <span aria-hidden className="mt-[5px] h-1.5 w-1.5 shrink-0 bg-signal" />
                      {p}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        {/* Bridge to SDM */}
        <section aria-labelledby="bridge-h" className="grid items-start gap-8 border border-line bg-raised p-5 sm:p-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-4">
            <SectionHead id="bridge-h" label="Two courses, one account" title="Connected to System Design Mastery">
              Kestrel&apos;s product lines are the systems System Design Mastery teaches. Each data structure links to the real system that depends on it, and both courses share
              your sign-in, profile, streak and XP.
            </SectionHead>
            <Link href="/" className="inline-flex min-h-12 items-center self-start border border-fg bg-fg px-5 text-[15px] font-semibold text-bg hover:opacity-90">
              Explore System Design Mastery →
            </Link>
          </div>
          <ul className="m-0 grid list-none gap-px border border-line bg-line p-0 sm:grid-cols-2">
            {BRIDGES.map((b) => (
              <li key={b.href} className="flex flex-col gap-1.5 bg-surface p-4">
                <span className="text-[15px] font-semibold text-fg">
                  {b.topic} <span aria-hidden className="text-signal-text">→</span> <span className="font-normal text-fg-2">{b.system}</span>
                </span>
                <Link href={b.href} className="self-start font-mono text-xs text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
                  {b.label} in System Design Mastery
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* FAQ + closing */}
        <section aria-labelledby="faq-h" className="grid items-start gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="flex flex-col gap-5">
            <SectionHead id="faq-h" label="Questions" title="Before you join" />
            <a href="#join" className="inline-flex min-h-12 items-center self-start bg-signal px-5 text-[15px] font-semibold text-on-signal hover:brightness-110">
              Join the waitlist
            </a>
          </div>
          <div className="flex flex-col border-t border-line">
            {FAQ.map((f) => (
              <details key={f.q} className="group border-b border-line">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-[16px] font-semibold text-fg [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span aria-hidden className="font-mono text-lg text-signal-text transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="m-0 pb-5 pr-8 text-[15px] leading-relaxed text-fg-2">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
