"use client";

import Link from "next/link";
import { useGame } from "@/game/GameProvider";
import { levelProgress } from "@/game/catalog";
import { EMAIL, SOCIALS } from "@/lib/socials";
import SocialIcon from "@/components/site/SocialIcon";
import { container } from "./ui";
import AnalyticsOptOut from "@/components/analytics/AnalyticsOptOut";

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
        <nav aria-label="Elsewhere" className="flex flex-wrap items-center gap-1">
          {SOCIALS.map((s) => (
            <a
              key={s.id}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${s.label} (${s.handle})`}
              title={s.label}
              className="grid h-10 w-10 place-items-center border border-line text-fg-2 no-underline hover:border-signal hover:text-signal-text"
            >
              <SocialIcon name={s.icon} className="h-[18px] w-[18px]" />
            </a>
          ))}
          <a
            href={`mailto:${EMAIL}`}
            aria-label={`email (${EMAIL})`}
            title="email"
            className="grid h-10 w-10 place-items-center border border-line text-fg-2 no-underline hover:border-signal hover:text-signal-text"
          >
            <SocialIcon name="email" className="h-[18px] w-[18px]" />
          </a>
        </nav>
        <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/learn/guide" className="inline-flex min-h-10 items-center text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
            how the course works
          </Link>
          <AnalyticsOptOut compact />
          <Player />
        </span>
      </div>
    </footer>
  );
}
