"use client";

/**
 * The world atlas row (six worlds) above the selected world's campus. Academy is open; picking another world shows
 * its regions on the same campus (as "opens later" buildings) or, when its spec has no regions, an "opens later"
 * card. The choice lives in ?world=<id> (replaceState), so a reload or a shared link keeps it.
 */
import { useEffect, useState } from "react";
import type { WorldSpec, WorldSummary } from "@/lib/dsa/types";
import Campus, { type LectureRef } from "./Campus";

export default function DsaWorlds({
  worlds,
  specs,
  lectures,
  mediaBase,
  initial = "academy",
}: {
  worlds: WorldSummary[];
  specs: Record<string, WorldSpec | null>;
  lectures: Record<string, LectureRef>;
  mediaBase: string | null;
  initial?: string;
}) {
  const [id, setId] = useState(initial);

  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get("world");
    // the URL is only readable after hydration (the page is prerendered)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (w && w !== initial && worlds.some((x) => x.id === w)) setId(w);
  }, [worlds, initial]);

  const pick = (w: string) => {
    setId(w);
    const url = new URL(window.location.href);
    if (w === initial) url.searchParams.delete("world");
    else url.searchParams.set("world", w);
    url.searchParams.delete("node");
    window.history.replaceState(window.history.state, "", url.toString());
  };

  const summary = worlds.find((w) => w.id === id);
  const spec: WorldSpec | null =
    specs[id] ||
    (summary ? { ...summary, division: "", theme: { map: summary.subtitle, road: "road", stops: {} }, regions: [], parts: [], final: null } : null);

  return (
    <div className="flex flex-col gap-8">
      <nav aria-label="Worlds" className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Six worlds · start with Academy</span>
        <ul className="m-0 grid list-none grid-cols-3 gap-px border border-line bg-line p-0 xl:grid-cols-6">
          {worlds.map((w) => {
            const active = w.id === id;
            return (
              <li key={w.id} className="flex">
                <button
                  type="button"
                  onClick={() => pick(w.id)}
                  aria-pressed={active}
                  className={`flex min-h-11 w-full flex-col items-start gap-1 px-2 py-2 text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-signal sm:px-3 sm:py-2.5 ${
                    active ? "bg-surface shadow-[inset_0_3px_0_var(--c-signal)]" : "bg-bg hover:bg-surface"
                  }`}
                >
                  <span className="font-mono text-[10px] text-signal-text sm:text-[11px]">World {w.order}</span>
                  <span className="font-display text-[13px] font-bold leading-tight tracking-[-0.01em] text-fg sm:text-[16px]">{w.title}</span>
                  <span className="font-mono text-[10px] uppercase tracking-label text-fg-3">{w.open ? "Open" : <><span className="sm:hidden">Later</span><span className="hidden sm:inline">Opens later</span></>}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {spec ? (
        <Campus key={spec.id} spec={spec} lectures={spec.open ? lectures : {}} mediaBase={mediaBase} />
      ) : (
        <p className="m-0 border border-line bg-surface p-5 text-fg-2">The world map couldn&apos;t load just now. Please refresh in a minute.</p>
      )}
    </div>
  );
}
