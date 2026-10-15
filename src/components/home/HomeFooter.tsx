"use client";

import { useGame } from "@/game/GameProvider";
import { levelProgress } from "@/game/catalog";
import { EMAIL, SOCIALS } from "@/lib/socials";
import { container } from "./ui";

function Player() {
  const { xp, hydrated } = useGame();
  if (!hydrated) return <span aria-hidden className="invisible">you: L1 · Intern · 0 xp</span>;
  const { level } = levelProgress(xp);
  return (
    <span>
      you: {level.code} · {level.name} · {xp} xp
    </span>
  );
}

export default function HomeFooter({ year }: { year: number }) {
  return (
    <footer className="border-t border-line">
      <div
        className={`${container} flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-6 font-mono text-xs text-fg-3`}
      >
        <span>© {year} himanshu kukreja · next.js + supabase on vercel</span>
        <nav aria-label="Elsewhere" className="flex flex-wrap items-center gap-x-1 gap-y-1">
          {SOCIALS.map((s) => (
            <a key={s.id} href={s.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center px-2 text-fg-2 no-underline hover:text-signal-text">
              {s.label}
            </a>
          ))}
          <a href={`mailto:${EMAIL}`} className="inline-flex min-h-10 items-center px-2 text-fg-2 no-underline hover:text-signal-text">
            email
          </a>
        </nav>
        <Player />
      </div>
    </footer>
  );
}
