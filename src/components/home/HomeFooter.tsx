"use client";

import { useGame } from "@/game/GameProvider";
import { levelProgress } from "@/game/catalog";
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
        <Player />
      </div>
    </footer>
  );
}
