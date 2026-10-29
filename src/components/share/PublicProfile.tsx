/**
 * Public learner page (/u/<handle>), server-rendered. Shows only what the learner made visible,
 * ends every section with a reason for the visitor to start: the free course or today's daily
 * challenge, both links carrying ?ref=<handle>.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { CourseMap } from "@/lib/learn/types";
import { LEVELS } from "@/game/catalog";
import { LEAGUES } from "@/lib/learn/arena/shared";
import { COURSE_NAME, withRef, type PublicProfile as Profile } from "@/lib/share/model";
import PublicTree from "./PublicTree";
import OwnerBar from "./OwnerBar";
import RefCapture from "./RefCapture";

const LABEL = "font-mono text-[11px] uppercase tracking-label text-fg-3";

const fmtDay = (at: number) => new Date(at).toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export function Avatar({ p, size = 72 }: { p: Pick<Profile, "avatar" | "initials">; size?: number }) {
  if (p.avatar)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote OAuth avatar; no next/image domain config for it
      <img src={p.avatar} alt="" width={size} height={size} referrerPolicy="no-referrer" className="shrink-0 border border-line-strong object-cover" style={{ width: size, height: size }} />
    );
  return (
    <span aria-hidden className="grid shrink-0 place-items-center bg-signal font-display font-extrabold tracking-[-0.04em] text-on-signal" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {p.initials}
    </span>
  );
}

function Stat({ value, unit, label, sub, accent = false }: { value: ReactNode; unit?: string; label: string; sub?: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-bg p-4 sm:p-5">
      <span className={LABEL}>{label}</span>
      <span className={`font-display text-[32px] font-extrabold leading-none tracking-[-0.04em] sm:text-[40px] ${accent ? "text-signal-text" : "text-fg"}`}>
        {value}
        {unit && <span className="ml-0.5 font-mono text-[13px] font-normal tracking-normal text-fg-3">{unit}</span>}
      </span>
      {sub && <span className="text-[12px] leading-snug text-fg-3">{sub}</span>}
    </div>
  );
}

function SectionHead({ id, n, kicker, title, right }: { id: string; n: string; kicker: string; title: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className={LABEL}>
          <span className="text-signal-text">{n}</span> · {kicker}
        </span>
        <h2 id={id} className="font-display text-[28px] font-extrabold leading-none tracking-[-0.035em] text-fg sm:text-[36px]">
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

export function StartCta({ handle, who, compact = false }: { handle: string; who: string; compact?: boolean }) {
  return (
    <aside aria-label="Start the course" className={`flex flex-col gap-4 border border-signal bg-surface ${compact ? "p-5" : "p-5 sm:p-7"}`}>
      <span className="font-mono text-[11px] uppercase tracking-label text-signal-text">free · no sign-up to read</span>
      <p className={`m-0 font-display font-extrabold leading-[0.95] tracking-[-0.04em] text-fg ${compact ? "text-[30px]" : "text-[clamp(32px,5vw,52px)]"}`}>
        Your turn<span className="text-signal-text">.</span>
      </p>
      <p className="m-0 text-[15px] leading-relaxed text-fg-2">
        {who} is learning with {COURSE_NAME}: 12 worlds, 11 interview bosses, 1,000+ quick checks and a daily challenge. Start where they started.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Link href={withRef("/learn", handle)} className="flex min-h-[52px] items-center justify-between gap-3 bg-signal px-5 text-base font-semibold text-on-signal hover:brightness-110">
          <span>Start the free course</span>
          <span aria-hidden className="font-mono">
            →
          </span>
        </Link>
        <Link href={withRef("/learn/arena/daily", handle)} className="flex min-h-[52px] items-center justify-between gap-3 border border-line-strong px-5 text-[15px] text-fg hover:bg-surface-2">
          <span>Take today&apos;s daily challenge</span>
          <span aria-hidden className="font-mono text-signal-text">
            →
          </span>
        </Link>
      </div>
    </aside>
  );
}

export default function PublicProfile({ p, map }: { p: Profile; map: CourseMap }) {
  const who = p.name ? p.name.split(" ")[0] : `@${p.handle}`;
  const lv = p.level;
  const c = p.course;
  const a = p.arena;
  let n = 0;
  const num = () => String(++n).padStart(2, "0");

  return (
    <main className="mx-auto flex max-w-[1180px] flex-col gap-12 px-4 pb-28 pt-8 sm:px-6 sm:pt-12 lg:gap-16">
      <RefCapture handle={p.handle} />
      <OwnerBar handle={p.handle} />

      {/* hero */}
      <section aria-labelledby="who-h" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-4">
            <span className={LABEL}>
              <span className="text-signal-text">~/u/</span>
              {p.handle} · public progress
            </span>
            <div className="flex items-center gap-4 sm:gap-5">
              <Avatar p={p} size={64} />
              <div className="flex min-w-0 flex-col gap-1">
                <h1 id="who-h" className="break-words font-display text-[clamp(38px,8vw,84px)] font-extrabold leading-[0.9] tracking-tightest text-fg">
                  {p.name || `@${p.handle}`}
                  <span className="text-signal-text">.</span>
                </h1>
                <span className="font-mono text-[12px] text-fg-3">
                  {p.name ? `@${p.handle} · ` : ""}
                  {COURSE_NAME}
                  {p.since ? ` · since ${p.since}` : ""}
                </span>
              </div>
            </div>
          </div>

          {lv && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="bg-signal px-2 py-1 font-mono text-[12px] font-semibold tracking-label text-on-signal">
                  {lv.code} · {lv.name.toUpperCase()}
                </span>
                <span className="font-mono text-[12px] text-fg-2">
                  {lv.xp.toLocaleString("en-US")} XP{lv.next ? ` · ${lv.next.toGo} to ${lv.next.code} ${lv.next.name}` : " · max level"}
                </span>
              </div>
              <div aria-hidden className="grid max-w-[620px] grid-cols-6 gap-1.5">
                {LEVELS.map((l, i) => (
                  <span key={l.code} className="flex flex-col gap-1.5">
                    <span className={`relative h-2 ${i < lv.index ? "bg-fg" : i === lv.index ? "bg-surface-2" : "border border-dashed border-line-strong"}`}>
                      {i === lv.index && <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${Math.max(6, lv.pct)}%` }} />}
                    </span>
                    <span className={`font-mono text-[10px] ${i === lv.index ? "font-semibold text-signal-text" : i < lv.index ? "text-fg-3" : "text-fg-4"}`}>
                      {l.code}
                      <span className="hidden sm:inline"> {l.name}</span>
                    </span>
                  </span>
                ))}
              </div>
              <span className="sr-only">
                Level {lv.code} {lv.name}, {lv.pct}% of the way to the next level
              </span>
            </div>
          )}

          {(c || p.streak) && (
            <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
              {c && p.level && <Stat value={c.pct} unit="%" label="course" sub={`${c.nodesDone} of ${c.nodesTotal} nodes`} accent />}
              {p.streak && <Stat value={p.streak.current} unit={p.streak.current === 1 ? "day" : "days"} label="streak" sub={`best ${p.streak.best} days`} />}
              {c && p.level && <Stat value={c.lessonsDone} unit={`/${c.lessonsTotal}`} label="lessons" sub="core lessons + bosses" />}
              {c && <Stat value={c.worldsCleared} unit={`/${c.worldsTotal}`} label="worlds" sub={`${c.bossesDone} boss${c.bossesDone === 1 ? "" : "es"} · ${c.trialPartsPassed} trial parts`} />}
            </div>
          )}

          {c && (
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className={LABEL}>world map</span>
                <span className="font-mono text-[11px] text-fg-3">
                  {c.worldsCleared} cleared · {c.weeks.filter((w) => w.started && !w.cleared).length} in progress
                </span>
              </div>
              <ol className="flex gap-[3px]" aria-label="Completion per world">
                {c.weeks.map((w) => (
                  <li key={w.key} className="flex min-w-0 flex-1 flex-col gap-1" title={`W${w.code} · ${w.title} · ${w.pct}%`}>
                    <span className={`relative block h-3 ${w.cleared ? "bg-fg" : "bg-surface-2"}`}>{!w.cleared && <span className="absolute inset-y-0 left-0 bg-signal" style={{ width: `${w.pct}%` }} />}</span>
                    <span className={`text-center font-mono text-[10px] ${w.cleared ? "text-fg-2" : w.started ? "text-signal-text" : "text-fg-4"}`}>{w.code}</span>
                    <span className="sr-only">
                      World {w.code} {w.title}: {w.pct}%
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-3 self-start">
          <StartCta handle={p.handle} who={who} compact />
          {a?.bestDaily && (
            <Link href={withRef("/learn/arena/daily", p.handle)} className="flex min-h-14 items-center justify-between gap-3 border border-line bg-surface px-4 py-3 hover:border-line-strong">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className={LABEL}>can you beat their score?</span>
                <span className="text-sm text-fg">
                  Best daily: {a.bestDaily.correct}/{a.bestDaily.total} · {a.bestDaily.score} pts
                </span>
              </span>
              <span className="shrink-0 font-mono text-[12px] text-signal-text">play →</span>
            </Link>
          )}
        </div>
      </section>

      {p.tree && (
        <section aria-labelledby="tree-h" className="flex flex-col gap-4">
          <SectionHead id="tree-h" n={num()} kicker="skill tree" title={`${who}'s skill tree`} right={<span className="font-mono text-[12px] text-fg-3">■ done · ▢ current · ┄ ahead · ◆ boss · T trial</span>} />
          <PublicTree map={map} tree={p.tree} />
        </section>
      )}

      {a && (
        <section aria-labelledby="arena-h" className="flex flex-col gap-4">
          <SectionHead id="arena-h" n={num()} kicker="arena" title="Scores" right={<span className="font-mono text-[12px] text-fg-3">weekly league · resets monday 00:00 ist</span>} />
          <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-5">
            <div className="flex flex-col gap-1.5 bg-bg p-4 sm:p-5">
              <span className={LABEL}>league</span>
              <span className={`self-start px-2 py-1 font-mono text-xs font-semibold ${a.tier >= 4 ? "bg-signal text-on-signal" : a.tier >= 2 ? "border border-signal text-signal-text" : "border border-line-strong text-fg-2"}`}>
                {LEAGUES[a.tier]?.code} <span className="font-normal">{LEAGUES[a.tier]?.name}</span>
              </span>
            </div>
            <Stat value={a.rank ? `#${a.rank}` : "–"} label="rank in league" sub={a.rank ? `of ${a.leaguePlayers} active this week` : "no points yet this week"} />
            <Stat value={a.weekPoints} label="points this week" sub={`${a.allTime.toLocaleString("en-US")} all time`} accent />
            <Stat value={a.bestDaily ? `${a.bestDaily.correct}/${a.bestDaily.total}` : "–"} label="best daily" sub={a.bestDaily ? `${a.bestDaily.score} pts · #${a.bestDaily.number}` : "no daily yet"} />
            <div className="col-span-2 sm:col-span-1">
              <Stat value={a.dailyStreak} unit="d" label="daily streak" sub="daily challenges in a row" />
            </div>
          </div>
          <Link href={withRef("/learn/arena/daily", p.handle)} className="flex min-h-[52px] items-center justify-between gap-3 border border-signal bg-surface px-5 hover:bg-surface-2 sm:self-start">
            <span className="text-[15px] font-semibold text-fg">Can you beat {who}? Take today&apos;s daily challenge</span>
            <span aria-hidden className="font-mono text-signal-text">
              →
            </span>
          </Link>
        </section>
      )}

      {(p.badges || p.milestones) && (
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-6">
          {p.badges && (
            <section aria-labelledby="badges-h" className="flex flex-col gap-4">
              <SectionHead id="badges-h" n={num()} kicker="badges" title={`${p.badges.length} earned`} />
              {p.badges.length ? (
                <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                  {p.badges.map((b) => (
                    <li key={b.id} className="flex items-start gap-3 border border-line bg-surface p-3.5">
                      <span aria-hidden className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center bg-signal font-mono text-[12px] font-semibold text-on-signal">
                        ✓
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-[15px] font-semibold text-fg">{b.name}</span>
                        <span className="text-[13px] leading-snug text-fg-3">{b.how}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 border border-dashed border-line-strong p-4 text-sm text-fg-3">No badges yet. The first one is a quick check away.</p>
              )}
            </section>
          )}
          {p.milestones && (
            <section aria-labelledby="ms-h" className="flex flex-col gap-4">
              <SectionHead id="ms-h" n={num()} kicker="recent" title="Milestones" />
              {p.milestones.length ? (
                <ol className="m-0 flex list-none flex-col border border-line bg-surface p-0">
                  {p.milestones.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
                      <span aria-hidden className="h-2 w-2 shrink-0 bg-signal" />
                      <span className="min-w-0 flex-1 text-[14px] text-fg">
                        {m.achievement ? (
                          <Link href={`/u/${p.handle}/a/${m.achievement}`} className="hover:underline hover:underline-offset-4">
                            {m.label}
                          </Link>
                        ) : (
                          m.label
                        )}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-fg-3">{fmtDay(m.at)}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="m-0 border border-dashed border-line-strong p-4 text-sm text-fg-3">Milestones show up as worlds, bosses and trials get cleared.</p>
              )}
            </section>
          )}
        </div>
      )}

      <StartCta handle={p.handle} who={who} />

      <p className="m-0 text-center font-mono text-[12px] leading-relaxed text-fg-4">
        {p.name || `@${p.handle}`} chose to share this page. Learners&apos; pages are private until they turn sharing on.{" "}
        <Link href={withRef("/learn/dashboard#share", p.handle)} className="text-fg-3 underline underline-offset-4 hover:text-fg">
          make your own →
        </Link>
      </p>
    </main>
  );
}
