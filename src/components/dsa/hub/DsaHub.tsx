import Link from "next/link";
import type { ConceptSummary, ProblemSummary, WorldSpec, WorldSummary } from "@/lib/dsa/types";
import { buildStepLabels, stepOf } from "@/lib/dsa/steps";
import DsaWorlds from "../map/DsaWorlds";
import type { LectureRef } from "../map/Campus";
import SolvedMark from "../problem/SolvedMark";
import HubStart from "./HubStart";
import BrowseEverything from "./BrowseEverything";

const WATCH = [
  { href: "/dsa/lectures", kicker: "Lectures", title: "Watch each lesson animated" },
  { href: "/dsa/shorts", kicker: "Shorts", title: "One idea in two minutes" },
  { href: "/dsa/cheatsheets", kicker: "Cheat sheets", title: "Every pattern on one page" },
];

/**
 * The /dsa hub in full mode (staging). Beginner pass (owner, 9 Nov 2026): it opens with one clear next step (HubStart:
 * the welcome on a first visit, then "Start lesson 1" / "Continue: <next>" and a compact "Today" line), the world map
 * below it (the six worlds and the selected world's campus), and every lesson and problem under a collapsed
 * "Browse everything" (open in the full view). Server-rendered from the content repo; progress paints in on the client.
 */
export default function DsaHub({
  worlds,
  specs,
  lectures,
  mediaBase,
  concepts,
  problems,
}: {
  worlds: WorldSummary[];
  specs: Record<string, WorldSpec | null>;
  lectures: Record<string, LectureRef>;
  mediaBase: string | null;
  concepts: ConceptSummary[];
  problems: ProblemSummary[];
}) {
  const built = concepts.filter((c) => c.status === "built");
  const steps = buildStepLabels(specs.academy ?? null, {});
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
        <HubStart academy={specs.academy ?? null} />

        {worlds.length ? (
          <DsaWorlds worlds={worlds} specs={specs} lectures={lectures} mediaBase={mediaBase} />
        ) : (
          <p className="m-0 border border-line bg-surface p-5 text-fg-2">The world map couldn&apos;t load just now. Please refresh in a minute.</p>
        )}

        <BrowseEverything count={built.length + problems.length}>
          {/* watch and revise: the lecture library, the shorts feed and the pattern sheets (on phones the dock has no room for them) */}
          <nav aria-label="Watch and revise" className="grid grid-cols-1 gap-px border border-line bg-line sm:grid-cols-3">
            {WATCH.map((w) => (
              <Link key={w.href} href={w.href} className="group flex min-h-16 flex-col gap-1 bg-surface px-4 py-3 hover:bg-surface-2">
                <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">{w.kicker}</span>
                <span className="text-[15px] font-semibold text-fg group-hover:text-signal-text">{w.title} →</span>
              </Link>
            ))}
          </nav>

          <section aria-labelledby="built-h" className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h2 id="built-h" className="m-0 font-mono text-xs uppercase tracking-label text-signal-text">
                Lessons ready to learn
              </h2>
              <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
                {built.map((c) => (
                  <li key={c.id} className="bg-surface">
                    <Link href={`/dsa/concepts/${c.id}`} className="flex flex-col gap-1 p-4 hover:bg-surface-2">
                      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{stepOf(steps, c.module).label}</span>
                      <span className="text-[16px] font-semibold text-fg">{c.title}</span>
                      <span className="text-[14px] text-fg-2">{c.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-3">
              <h2 className="m-0 font-mono text-xs uppercase tracking-label text-signal-text">Practice problems</h2>
              <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
                {problems.map((p) => (
                  <li key={p.id} className="bg-surface">
                    <Link href={`/dsa/problems/${p.id}`} className="flex items-center gap-3 p-4 hover:bg-surface-2">
                      <SolvedMark id={p.id} />
                      <span className="min-w-0 flex-1 text-[15px] text-fg">{p.title}</span>
                      <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{p.level}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link href="/dsa/problems" className="self-start font-mono text-[13px] text-signal-text underline decoration-line-strong underline-offset-4">
                all problems →
              </Link>
            </div>
          </section>
        </BrowseEverything>
      </main>
    </div>
  );
}
