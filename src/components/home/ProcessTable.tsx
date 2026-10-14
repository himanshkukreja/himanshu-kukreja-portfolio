"use client";

import Link from "next/link";
import { useGame } from "@/game/GameProvider";
import { container } from "./ui";

type Proc = { pid: string; cpu: string; stat: "R" | "S"; cmd: string; what: string; href: string; external?: boolean };

const PROCS: Proc[] = [
  { pid: "1", cpu: "68.0", stat: "R", cmd: "senseloaf/sia", what: "SIA: the chat where a recruiter hires end to end, plus its MCP server", href: "https://senseloaf.ai", external: true },
  { pid: "2", cpu: "21.5", stat: "R", cmd: "markdrop", what: "Docs and files as links that render. Nights and weekends.", href: "https://markdrop.in", external: true },
  { pid: "3", cpu: "6.0", stat: "S", cmd: "sd-mastery", what: "Free system design course · 91 lessons", href: "/learn" },
  { pid: "4", cpu: "3.1", stat: "S", cmd: "case-files", what: "Drafting CASE-011", href: "/stories" },
];

const cols = "grid grid-cols-[60px_70px_70px_220px_minmax(0,1fr)_110px] items-center gap-3 px-4";

const attachClass =
  "inline-flex min-h-11 items-center border border-line-strong px-2.5 text-xs text-fg-2 no-underline hover:bg-surface-2 hover:text-fg";

export default function ProcessTable() {
  const { flags, setFlag, award, hydrated } = useGame();
  const killed = hydrated && flags.killedSleep === true;

  const kill = () => {
    setFlag("killedSleep", true);
    award("kill", "kill -9 sleep · it was already dead");
  };

  return (
    <section aria-labelledby="ps-h" className="border-y border-line bg-raised">
      <div className={`${container} flex min-w-0 flex-col gap-5 py-12 sm:py-14`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="ps-h" className="m-0 font-mono text-lg font-semibold sm:text-[22px]">
            <span className="text-signal-text">❯</span> ps aux | grep himanshu
          </h2>
          <span className="text-sm text-fg-3">What&apos;s running right now. One process looks suspicious.</span>
        </div>

        <div className="relative w-full min-w-0 max-w-full overflow-x-auto border border-line bg-bg" role="region" aria-label="Process table" tabIndex={0}>
          <div className="min-w-[820px] font-mono text-[13px]" role="table" aria-label="Running processes">
            <div className={`${cols} border-b border-line py-2.5 tracking-[0.06em] text-fg-3`} role="row">
              <span role="columnheader">PID</span>
              <span role="columnheader">%CPU</span>
              <span role="columnheader">STAT</span>
              <span role="columnheader">COMMAND</span>
              <span role="columnheader">WHAT IT IS</span>
              <span role="columnheader">
                <span className="sr-only">Action</span>
              </span>
            </div>

            {PROCS.map((p) => (
              <div key={p.pid} className={`${cols} border-b border-surface-2 py-2.5 text-fg-2`} role="row">
                <span role="cell" className="text-fg-3">{p.pid}</span>
                <span role="cell">{p.cpu}</span>
                <span role="cell" className={p.stat === "R" ? "text-ok" : "text-fg-3"}>{p.stat}</span>
                <span role="cell" className="font-semibold text-fg">{p.cmd}</span>
                <span role="cell" className="font-sans text-sm text-fg-2">{p.what}</span>
                <span role="cell" className="flex justify-end">
                  {p.external ? (
                    <a href={p.href} target="_blank" rel="noopener noreferrer" className={attachClass} aria-label={`attach to ${p.cmd}`}>
                      attach →
                    </a>
                  ) : (
                    <Link href={p.href} className={attachClass} aria-label={`attach to ${p.cmd}`}>
                      attach →
                    </Link>
                  )}
                </span>
              </div>
            ))}

            <div
              className={`${cols} border-b border-surface-2 py-2.5 text-fg-2 ${killed ? "line-through opacity-45" : ""}`}
              role="row"
            >
              <span role="cell" className="text-fg-3">5</span>
              <span role="cell">0.0</span>
              <span role="cell" className={killed ? "text-fg-3" : "text-bad-text"}>{killed ? "X" : "Z"}</span>
              <span role="cell" className="font-semibold text-fg">sleep</span>
              <span role="cell" className="font-sans text-sm text-fg-2" aria-live="polite">
                {killed ? "terminated. nobody noticed." : "zombie since 2023. parent: senseloaf"}
              </span>
              <span role="cell" className="flex justify-end">
                {!killed && (
                  <button
                    type="button"
                    onClick={kill}
                    aria-label="kill -9 the zombie sleep process"
                    className="min-h-11 border border-bad px-3 font-mono text-xs text-bad-text hover:bg-surface-2"
                  >
                    kill -9
                  </button>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
