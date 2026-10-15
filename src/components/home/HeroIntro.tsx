"use client";

import { useGame } from "@/game/GameProvider";
import { LEVELS, levelIndex } from "@/game/catalog";
import { Dot, container } from "./ui";
import { PERSON } from "./showcase/data";
import { branchStats, label } from "./showcase/parts";
import { openWorld } from "./showcase/bus";
import { EMAIL, SOCIALS as SOCIAL_LINKS } from "@/lib/socials";

const SOCIALS = SOCIAL_LINKS.map((s) => ({ href: s.href, label: s.label, extra: s.id === "github" ? `★ ${PERSON.stars}` : undefined }));

/** He sits at L4 · Senior on the same ladder visitors climb on this site. */
const HIS_LEVEL = 3;

/** Build stats: receipts on file per skill branch (see the skill tree). Nothing here is a self-rating. */
function Radar() {
  const stats = branchStats();
  const max = Math.max(...stats.map((s) => s.n));
  const size = 184;
  const c = size / 2;
  const r = c - 30;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / stats.length - Math.PI / 2;
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v] as const;
  };
  const poly = (vals: number[]) => vals.map((v, i) => pt(i, v).join(",")).join(" ");
  return (
    <a
      href="#skills"
      className="group block shrink-0 no-underline"
      aria-label={`Build stats, receipts on file per branch: ${stats.map((s) => `${s.name} ${s.n}`).join(", ")}. Open the skill tree.`}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden className="block">
        {[0.34, 0.67, 1].map((v) => (
          <polygon key={v} points={poly(stats.map(() => v))} fill="none" stroke="var(--c-line)" strokeWidth="1" />
        ))}
        {stats.map((_, i) => {
          const [x, y] = pt(i, 1);
          return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--c-line)" strokeWidth="1" />;
        })}
        <polygon
          points={poly(stats.map((s) => s.n / max))}
          fill="color-mix(in srgb, var(--c-signal) 22%, transparent)"
          stroke="var(--c-signal)"
          strokeWidth="1.5"
          className="transition-[fill] group-hover:[fill:color-mix(in_srgb,var(--c-signal)_38%,transparent)]"
        />
        {stats.map((s, i) => {
          const [x, y] = pt(i, s.n / max);
          return <rect key={s.id} x={x - 2.5} y={y - 2.5} width="5" height="5" fill="var(--c-signal)" />;
        })}
        {stats.map((s, i) => {
          const [x, y] = pt(i, 1.22);
          return (
            <text
              key={s.id}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="9.5"
              letterSpacing="0.06em"
              fill="var(--c-fg-3)"
              fontFamily="var(--font-geist-mono), ui-monospace, monospace"
            >
              {s.short.toUpperCase()}
            </text>
          );
        })}
      </svg>
    </a>
  );
}

function Ladder() {
  const { xp, hydrated } = useGame();
  const you = hydrated ? levelIndex(xp) : 0;
  const his = LEVELS[HIS_LEVEL];
  return (
    <div className="flex min-w-[200px] flex-1 flex-col gap-2.5">
      <span className={label}>rank · this site&apos;s ladder</span>
      <ol
        className="m-0 grid list-none grid-cols-6 gap-1 p-0"
        aria-label={`Himanshu is ${his.code} ${his.name}. You are ${LEVELS[you].code} ${LEVELS[you].name}.`}
      >
        {LEVELS.map((l, i) => (
          <li key={l.code} className="flex flex-col items-center gap-1">
            <span
              className={`flex h-9 w-full items-center justify-center font-mono text-[11px] ${
                i <= HIS_LEVEL ? "bg-signal font-semibold text-on-signal" : "border border-dashed border-line-strong text-fg-4"
              }`}
            >
              {l.code}
            </span>
            <span aria-hidden className={`font-mono text-[10px] ${i === you ? "text-fg" : "text-transparent"}`}>
              ▲ you
            </span>
          </li>
        ))}
      </ol>
      <span className="text-[13px] leading-snug text-fg-2">
        <b className="font-semibold text-fg">
          {his.code} · {his.name}
        </b>{" "}
        with the eng-lead perk. You&apos;re {LEVELS[you].code}: explore the page to catch up.
      </span>
    </div>
  );
}

function Zombie() {
  const { flags, setFlag, award, hydrated } = useGame();
  const killed = hydrated && flags.killedSleep === true;
  const kill = () => {
    setFlag("killedSleep", true);
    award("kill", "kill -9 sleep · it was already dead");
  };
  return (
    <div className="flex items-center justify-between gap-3 border-t border-line bg-surface px-3.5 py-2.5 sm:px-4">
      <span className="flex min-w-0 items-center gap-2.5 font-mono text-[12px]" aria-live="polite">
        <span className={`grid h-6 w-6 shrink-0 place-items-center border text-[11px] ${killed ? "border-line text-fg-4" : "border-bad text-bad-text"}`}>
          {killed ? "X" : "Z"}
        </span>
        <span className={`min-w-0 ${killed ? "text-fg-4 line-through" : "text-fg-2"}`}>
          <span className="text-fg-4">status: </span>
          {killed ? "sleep · terminated. nobody noticed." : "sleep · zombie since apr 2026"}
        </span>
      </span>
      {!killed && (
        <button
          type="button"
          onClick={kill}
          aria-label="kill -9 the zombie sleep process"
          className="min-h-10 shrink-0 border border-bad px-3 font-mono text-xs text-bad-text hover:bg-surface-2"
        >
          kill -9
        </button>
      )}
    </div>
  );
}

function PlayerCard() {
  return (
    <div className="flex min-w-0 flex-col border border-line-strong bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 sm:px-4">
        <span className={label}>player card · p1</span>
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-label text-fg-3">
          <span aria-hidden className="h-2 w-2 bg-ok motion-safe:animate-hk-blink" /> online
        </span>
      </div>

      <div className="flex items-center gap-3.5 border-b border-line p-3.5 sm:gap-4 sm:p-4">
        <span
          aria-hidden
          className="grid h-[72px] w-[72px] shrink-0 place-items-center bg-signal font-display text-[34px] font-extrabold tracking-[-0.06em] text-on-signal sm:h-20 sm:w-20 sm:text-[38px]"
        >
          HK
        </span>
        <dl className="m-0 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[13px] leading-[1.55]">
          <dt className="text-fg-4">class</dt>
          <dd className="m-0 text-fg">full-stack · AI agents</dd>
          <dt className="text-fg-4">guild</dt>
          <dd className="m-0 text-fg">Senseloaf AI</dd>
          <dt className="text-fg-4">title</dt>
          <dd className="m-0 text-fg">Senior SWE · eng lead</dd>
          <dt className="text-fg-4">base</dt>
          <dd className="m-0 text-fg">{PERSON.city}</dd>
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border-b border-line p-3.5 sm:justify-start sm:p-4">
        <Radar />
        <Ladder />
      </div>

      <div className="grid grid-cols-1 gap-px bg-line min-[440px]:grid-cols-2">
        <button type="button" onClick={() => openWorld("senseloaf")} className="flex flex-col items-start gap-1 bg-surface p-3.5 text-left text-fg hover:bg-surface-2 sm:p-4">
          <span className={label}>main quest</span>
          <span className="text-[15px] font-semibold">SIA + its MCP server</span>
          <span className="text-[13px] text-fg-3">hiring, from one conversation</span>
        </button>
        <a href={PERSON.markdrop} target="_blank" rel="noopener noreferrer" className="flex flex-col gap-1 bg-surface p-3.5 text-fg no-underline hover:bg-surface-2 sm:p-4">
          <span className={label}>side quest · since mar 2026</span>
          <span className="text-[15px] font-semibold">Markdrop ↗</span>
          <span className="text-[13px] text-fg-3">docs and files as links that render</span>
        </a>
      </div>
      <Zombie />
    </div>
  );
}

/** Home hero: who he is, as a player card on the same level ladder the visitor is climbing. */
export default function HeroIntro() {
  return (
    <section
      aria-label="Intro"
      className={`${container} grid items-start gap-10 pb-14 pt-6 sm:pb-[72px] sm:pt-14 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-14`}
    >
      <div className="flex min-w-0 flex-col gap-6 lg:pt-2">
        <span className="font-mono text-[13px] text-signal-text">❯ player 1 · press start</span>
        <h1 className="m-0 font-display text-[clamp(60px,8.4vw,124px)] font-extrabold leading-[0.84] tracking-tightest text-fg">
          {PERSON.first}
          <br />
          {PERSON.last}
          <Dot />
        </h1>
        <p className="m-0 max-w-[600px] text-base leading-normal text-fg-2 [text-wrap:pretty] sm:text-xl">
          <span className="sm:hidden">Senior engineer and eng lead at Senseloaf AI. I ship product end to end, from research and UI to infra.</span>
          <span className="hidden sm:inline">
            Senior engineer and eng lead at Senseloaf AI. I ship product end to end: research, UI, frontend, backend, infra.
            Before this, real phones streamed to browsers in under 100 ms, and an AI testing backend from an empty repo.
          </span>
        </p>
        <div className="flex flex-wrap gap-2.5">
          <a
            href="#rush"
            className="inline-flex min-h-[52px] items-center gap-2.5 bg-signal px-[22px] text-base font-semibold text-on-signal no-underline hover:brightness-110 motion-safe:animate-hk-pulse"
          >
            Play Tatkal Rush
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <path d="M7 4l12 8-12 8z" />
            </svg>
          </a>
          <a
            href="#career"
            className="inline-flex min-h-[52px] items-center border border-line-strong px-5 font-mono text-[15px] text-fg no-underline hover:bg-surface-2"
          >
            ./career --map
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href="/resume.pdf"
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center border border-line px-3 font-mono text-[13px] text-fg-2 no-underline hover:border-line-strong hover:text-fg"
          >
            resume.pdf
          </a>
          {SOCIALS.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 border border-line px-3 font-mono text-[13px] text-fg-2 no-underline hover:border-line-strong hover:text-fg"
            >
              {s.label}
              {s.extra && <span className="text-signal-text">{s.extra}</span>}
            </a>
          ))}
          <a
            href={`mailto:${EMAIL}`}
            className="inline-flex min-h-11 items-center border border-line px-3 font-mono text-[13px] text-fg-2 no-underline hover:border-line-strong hover:text-fg"
          >
            {EMAIL}
          </a>
        </div>
      </div>
      <PlayerCard />
    </section>
  );
}
