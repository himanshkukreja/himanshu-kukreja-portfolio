"use client";

import { mmss, type Phase, type RunCopy } from "./shared";
import ShareButton from "@/components/share/ShareButton";

const PASS = 0.7;

export default function BossDebrief(props: {
  copy: RunCopy;
  bonusPaid: boolean;
  name: string;
  weekNum: string;
  mode: "interview" | "read";
  phases: Phase[];
  used: Record<string, number>;
  revealed: Record<string, boolean>;
  drafts: Record<string, string>;
  totalMin: number;
  timed: boolean;
  checklist: string[];
  closing: string | null;
  rub: boolean[];
  setRub: (rub: boolean[]) => void;
  defeated: boolean;
  onClaim: () => number;
  onRetry?: () => void;
  onBack?: () => void;
  onBrief: () => void;
}) {
  const { phases, used, revealed, drafts, checklist, rub, mode, copy } = props;
  const reward = copy.quest && props.bonusPaid && !props.defeated ? "Mark cleared · bonus already banked" : `Claim +${copy.xp} XP`;
  const interview = mode === "interview";
  // The capstone's own checklist; without one, the phases themselves are the rubric
  const items = checklist.length ? checklist : phases.map((p) => `I covered Phase ${p.n}: ${p.title}`);
  const n = items.length;
  const ticked = items.filter((_, k) => rub[k]).length;
  const pct = n ? Math.round((ticked / n) * 100) : 0;
  const passed = n > 0 && ticked / n >= PASS;
  const need = Math.ceil(n * PASS);
  const answered = phases.filter((p) => revealed[p.id]).length;
  const over = phases.filter((p) => p.budgetMinutes && (used[p.id] || 0) > p.budgetMinutes * 60).length;
  const totalUsed = phases.reduce((a, p) => a + (used[p.id] || 0), 0);
  const unticked = n - ticked;
  const toggle = (k: number) => {
    const next = items.map((_, j) => !!rub[j]);
    next[k] = !next[k];
    props.setRub(next);
  };
  const quote = props.closing ? props.closing.split(/(?<=[.!?])\s/)[0] : null;
  const maxSec = Math.max(1, ...phases.map((p) => Math.max((p.budgetMinutes || 0) * 60, used[p.id] || 0)));

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs uppercase tracking-label text-signal-text">
          Debrief{copy.quest ? " · side quest timed run" : props.weekNum ? ` · Week ${props.weekNum} boss` : ""} · {interview ? "interview mode" : "read mode"}
        </span>
        <h2 className="m-0 font-display text-[clamp(38px,5.4vw,76px)] font-extrabold leading-[0.92] tracking-[-0.05em] text-fg">
          {quote ? (
            <>
              Interviewer: “{quote.replace(/[.!?]$/, "")}
              <span className="text-signal-text">.</span>” Was it?
            </>
          ) : (
            <>
              Debrief<span className="text-signal-text">.</span> How did it go?
            </>
          )}
        </h2>
        <p className="m-0 max-w-[760px] text-[17px] leading-relaxed text-fg-2">
          Score yourself against {checklist.length ? `the ${copy.source}'s Self-Assessment Checklist` : "the phases you worked through"}. Tick only what you could do without the model answer open. You have the final word.
        </p>
      </div>

      {interview && phases.length > 0 && (
        <div className="flex flex-wrap gap-px self-start border border-line bg-line">
          {props.timed && <Stat value={mmss(totalUsed)} suffix={` / ${props.totalMin}:00`} label="time used" />}
          <Stat value={String(answered)} suffix={` / ${phases.length}`} label="phases answered" />
          {props.timed && <Stat value={String(over)} label="phases over budget" />}
        </div>
      )}

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="rub-h" className="flex min-w-0 flex-[999_1_600px] flex-col border border-line-strong bg-surface">
          <div className="flex flex-col gap-1 border-b border-line px-5 py-[18px]">
            <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">Rubric · {checklist.length ? "Self-Assessment Checklist" : "phases"}</span>
            <h3 id="rub-h" className="m-0 font-display text-2xl font-bold tracking-[-0.02em] text-fg">
              {checklist.length ? `After this ${copy.source}, I can…` : copy.quest ? "In this run, I…" : "In this fight, I…"}
            </h3>
          </div>
          <ul className="m-0 flex list-none flex-col px-3 py-2">
            {items.map((text, k) => (
              <li key={k} className="border-b border-line last:border-b-0">
                <label className={`flex min-h-[52px] cursor-pointer items-center gap-3.5 px-2 py-2.5 ${rub[k] ? "text-fg" : "text-fg-2"}`}>
                  <input type="checkbox" checked={!!rub[k]} onChange={() => toggle(k)} className="m-0 h-5 w-5 shrink-0 accent-[#FF6B2B]" />
                  <span className="flex-grow text-base leading-snug">{text}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2.5 border-t border-line px-5 pb-[22px] pt-[18px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[26px] font-semibold text-fg">
                {ticked}
                <span className="text-[15px] text-fg-3">
                  /{n} · {pct}%
                </span>
              </span>
              <span className="font-mono text-xs text-fg-3">pass mark 70% · {need} of {n}</span>
            </div>
            <div role="progressbar" aria-label="Rubric score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="relative h-3.5 bg-surface-2">
              <div className={`h-3.5 ${passed ? "bg-signal" : "bg-fg-4"}`} style={{ width: `${pct}%` }} />
              <span aria-hidden="true" className="absolute -bottom-[5px] -top-[5px] left-[70%] w-0.5 bg-fg" />
            </div>
          </div>
        </section>

        <aside aria-label="Verdict" className="flex min-w-0 flex-[1_1_360px] flex-col gap-4">
          {passed && interview ? (
            <div className="flex animate-hk-in flex-col gap-4 border border-signal bg-surface p-6">
              <div className="flex items-center gap-5">
                <div aria-hidden="true" className="m-2 grid h-14 w-14 shrink-0 rotate-45 place-items-center bg-signal">
                  <span className="-rotate-45 font-mono text-lg font-semibold text-on-signal">✓</span>
                </div>
                <span className="font-display text-[38px] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
                  {copy.win}<span className="text-signal-text">.</span>
                </span>
              </div>
              <span className="text-[15px] leading-relaxed text-fg-2">
                {copy.quest
                  ? props.defeated
                    ? "Cleared under interview conditions. The side-quest bonus is yours."
                    : `${ticked} of ${n} on the checklist. Claim it to bank the side-quest bonus.`
                  : props.defeated
                    ? "The boss node on this week's skill tree is cleared and the XP is yours."
                    : `${ticked} of ${n} on the checklist. Claim the reward to clear the boss node on your skill tree.`}
              </span>
              <button
                type="button"
                onClick={() => props.onClaim()}
                disabled={props.defeated}
                className="min-h-[52px] bg-signal px-5 text-base font-semibold text-on-signal hover:opacity-90 disabled:cursor-default disabled:bg-surface-2 disabled:text-fg-2"
              >
                {props.defeated ? (copy.quest ? "Cleared ✓" : `Claimed · +${copy.xp} XP ✓`) : reward}
              </button>
              {props.defeated && !copy.quest && props.weekNum && <ShareButton kind="boss" achievement={`boss-${props.weekNum}`} title={props.weekNum} detail={props.name} label="Share the win" className="min-h-[52px]" />}
            </div>
          ) : passed ? (
            <div className="flex flex-col gap-3.5 border border-line-strong bg-surface p-6">
              <span className="font-display text-[34px] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
                Studied, not fought<span className="text-signal-text">.</span>
              </span>
              <span className="text-[15px] leading-relaxed text-fg-2">
                You cleared the rubric in read mode.{" "}
                {props.onRetry ? `Run it in interview mode, answers hidden${props.timed ? " and clock on" : ""}, to claim the +${copy.xp} XP.` : "XP is only awarded in a timed interview."}
              </span>
              {props.onRetry && (
                <button type="button" onClick={props.onRetry} className="min-h-[52px] bg-signal px-5 text-base font-semibold text-on-signal hover:opacity-90">
                  {copy.quest ? "Run it in interview mode" : "Fight it in interview mode"}
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5 border border-bad bg-surface p-6">
              <span className="font-mono text-xs tracking-label text-bad-text">
                {copy.quest ? "NOT CLEARED YET" : "BOSS STILL STANDING"} · {ticked}/{n}
              </span>
              <span className="font-display text-[34px] font-extrabold leading-[0.95] tracking-[-0.04em] text-fg">
                Not yet<span className="text-signal-text">.</span>
              </span>
              <span className="text-[15px] leading-relaxed text-fg-2">
                You need {need} of {n}; you have {ticked}. The {unticked} unticked {unticked === 1 ? "item points" : "items point"} at the phases to re-read before you fight again.
              </span>
              {props.onRetry && (
                <button type="button" onClick={props.onRetry} className="min-h-[52px] bg-signal px-5 text-base font-semibold text-on-signal hover:opacity-90">
                  Retry in interview mode
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      {interview && props.timed && phases.length > 0 && (
        <section aria-labelledby="time-h" className="flex flex-col gap-3.5 border border-line bg-raised p-5 sm:p-[22px]">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <h3 id="time-h" className="m-0 font-display text-2xl font-bold tracking-[-0.02em] text-fg">
              Time used vs budget
            </h3>
            <div className="flex flex-wrap items-center gap-4 text-xs text-fg-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-[18px] border border-dashed border-fg-4" />
                budget
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-[18px] bg-fg" />
                used
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-[18px] bg-bad" />
                overtime
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <ol className="m-0 flex min-w-[640px] list-none flex-col p-0">
              {phases.map((p) => {
                const b = (p.budgetMinutes || 0) * 60;
                const u = used[p.id] || 0;
                const inBudget = b ? Math.min(u, b) : u;
                const ov = b ? Math.max(0, u - b) : 0;
                const d = u - b;
                const w = (drafts[p.id] || "").trim() ? (drafts[p.id] || "").trim().split(/\s+/).length : 0;
                return (
                  <li key={p.id} className="flex items-center gap-4 border-b border-line py-2 last:border-b-0">
                    <span className="flex w-[260px] shrink-0 items-baseline gap-2.5">
                      <span className="w-6 font-mono text-xs text-signal-text">P{p.n}</span>
                      <span className="text-sm text-fg-2">{p.title}</span>
                    </span>
                    <span className="relative h-4 flex-grow" aria-hidden="true">
                      {b > 0 && <span className="absolute inset-y-0 left-0 border border-dashed border-fg-4" style={{ width: `${(b / maxSec) * 100}%` }} />}
                      <span className="absolute top-1 h-2 bg-fg" style={{ left: 0, width: `${(inBudget / maxSec) * 100}%` }} />
                      {ov > 0 && <span className="absolute top-1 h-2 bg-bad" style={{ left: `${(b / maxSec) * 100}%`, width: `${(ov / maxSec) * 100}%` }} />}
                    </span>
                    <span className="w-[110px] shrink-0 text-right font-mono text-[13px] text-fg">
                      {mmss(u)}
                      {b ? ` / ${p.budgetMinutes}:00` : ""}
                    </span>
                    <span className={`w-[110px] shrink-0 text-right font-mono text-xs ${d > 0 && b ? "text-bad-text" : "text-fg-3"}`}>
                      {!b ? "untimed" : u === 0 ? "not timed" : d > 0 ? `+${mmss(d)} over` : d === 0 ? "on budget" : `−${mmss(-d)} spare`}
                    </span>
                    <span className="w-[72px] shrink-0 text-right font-mono text-xs text-fg-3">{w} words</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {props.onBack && (
          <button type="button" onClick={props.onBack} className="min-h-[44px] border border-line-strong px-4 text-sm text-fg hover:border-fg-3">
            ← Back to the phases
          </button>
        )}
        <button type="button" onClick={props.onBrief} className="min-h-[44px] border border-line-strong px-4 text-sm text-fg hover:border-fg-3">
          Briefing
        </button>
      </div>
    </div>
  );
}

function Stat({ value, suffix, label }: { value: string; suffix?: string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5 bg-bg px-[18px] py-3">
      <span className="font-mono text-[22px] font-semibold text-fg">
        {value}
        {suffix && <span className="text-sm text-fg-3">{suffix}</span>}
      </span>
      <span className="text-xs text-fg-3">{label}</span>
    </div>
  );
}
