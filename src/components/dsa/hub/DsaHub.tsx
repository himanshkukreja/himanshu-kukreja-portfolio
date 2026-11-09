import Link from "next/link";
import type { ConceptSummary, ProblemSummary, WorldSpec, WorldSummary } from "@/lib/dsa/types";
import WorldMap from "../map/WorldMap";
import SolvedMark from "../problem/SolvedMark";

/**
 * The /dsa hub in full mode (staging): the world atlas (six worlds, Academy open), the Academy map, and what is
 * built so far. Server-rendered from the content repo; progress paints in on the client (WorldMap, SolvedMark).
 */
export default function DsaHub({ worlds, world, concepts, problems }: { worlds: WorldSummary[]; world: WorldSpec | null; concepts: ConceptSummary[]; problems: ProblemSummary[] }) {
  const built = concepts.filter((c) => c.status === "built");
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-28 pt-8 sm:px-6 sm:pt-10">
        <header className="flex flex-col gap-3">
          <span className="font-mono text-xs uppercase tracking-label text-signal-text">The world atlas</span>
          <h1 className="m-0 font-display text-[40px] font-extrabold leading-[0.95] tracking-tightest text-fg sm:text-[56px]">
            Pick a world, follow the road<span className="text-signal-text">.</span>
          </h1>
          <p className="m-0 max-w-[720px] text-[16px] leading-relaxed text-fg-2 sm:text-[18px]">
            Each world is a Kestrel division with its own map. Concepts are rooms you can always read; practice problems are the road between them; a checkpoint opens the
            gate to the next stretch. A solve counts in every world that contains it.
          </p>
        </header>

        <section aria-labelledby="atlas-h" className="flex flex-col gap-4">
          <h2 id="atlas-h" className="sr-only">
            Worlds
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-px border border-line bg-line p-0 sm:grid-cols-2 lg:grid-cols-3">
            {worlds.map((w) => {
              const active = w.id === world?.id;
              return (
                <li key={w.id} className={`flex flex-col gap-2 p-5 ${active ? "bg-surface" : "bg-bg"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-signal-text">World {w.order}</span>
                    <span
                      className={`border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-label ${w.open ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-3"}`}
                    >
                      {w.open ? (active ? "Open · on the map" : "Open") : "Opens later"}
                    </span>
                  </div>
                  <span className="font-display text-[24px] font-bold leading-tight tracking-[-0.02em] text-fg">{w.title}</span>
                  <span className="text-[14px] text-fg-2">{w.subtitle}</span>
                  <span className="mt-auto border-t border-line pt-2 text-[13px] leading-relaxed text-fg-3">{w.open ? w.audience : w.atLaunch}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {world ? (
          <section aria-labelledby="map-h" className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="font-mono text-xs uppercase tracking-label text-signal-text">
                World {world.order} · {world.subtitle}
              </span>
              <h2 id="map-h" className="m-0 font-display text-[32px] font-bold leading-none tracking-[-0.03em] text-fg sm:text-[40px]">
                {world.title}
                <span className="text-signal-text">.</span>
              </h2>
              <p className="m-0 max-w-[720px] text-[15px] leading-relaxed text-fg-2">{world.theme.map}</p>
            </div>
            <WorldMap spec={world} />
          </section>
        ) : (
          <p className="m-0 border border-line bg-surface p-5 text-fg-2">The world map couldn&apos;t load just now. Please refresh in a minute.</p>
        )}

        <section aria-labelledby="built-h" className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 id="built-h" className="m-0 font-mono text-xs uppercase tracking-label text-signal-text">
              Concepts ready to learn
            </h2>
            <ul className="m-0 flex list-none flex-col gap-px border border-line bg-line p-0">
              {built.map((c) => (
                <li key={c.id} className="bg-surface">
                  <Link href={`/dsa/concepts/${c.id}`} className="flex flex-col gap-1 p-4 hover:bg-surface-2">
                    <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{c.module.replace(/^m(\d+)-/, "M$1 · ").replace(/-/g, " ")}</span>
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
      </main>
    </div>
  );
}
