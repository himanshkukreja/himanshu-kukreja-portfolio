"use client";

/**
 * A war room: an incident played as its chat channel. Messages arrive one by one (faster with Fast,
 * all at once up to the next call with Skip); at each decision you pick the next move. A wrong move
 * shows what it cost (minutes, users) and who told you why, then you pick again; the story goes on
 * after the best move. At the end: your rating, the postmortem and the real incident it is modelled
 * on. Clearing it pays WAR_ROOM_XP once (game key warroom:<slug>); the best run is kept in this browser.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useGame } from "@/game/GameProvider";
import { track } from "@/lib/track";
import { WAR_ROOM_XP, warRoomKey, type Beat, type CastMember, type WarRoom } from "@/lib/learn/war/types";
import { readRuns, saveRun, WAR_EVENT } from "./store";

const subscribe = (cb: () => void) => {
  window.addEventListener(WAR_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(WAR_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

const LABEL = "font-mono text-[11px] uppercase tracking-label";

type Pick = { option: number };

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function speakerOf(label: string, cast: CastMember[]): CastMember | null {
  const l = label.trim().toLowerCase();
  if (!l) return null;
  return cast.find((c) => c.id === l || c.name.toLowerCase() === l || c.name.split(/\s+/)[0].toLowerCase() === l.split(/\s+/)[0]) ?? null;
}

function Avatar({ who }: { who: CastMember | null }) {
  const you = who?.id === "you";
  return (
    <span
      aria-hidden
      className={`grid h-9 w-9 shrink-0 place-items-center font-mono text-[12px] font-semibold ${you ? "bg-signal text-on-signal" : "border border-line-strong bg-surface-2 text-fg"}`}
    >
      {who ? initials(who.name) : "··"}
    </span>
  );
}

function Spark({ points }: { points: number[] }) {
  const w = 320;
  const h = 64;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * (w - 8) + 4, h - 6 - ((p - min) / span) * (h - 14)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <div className="flex items-end gap-3">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full max-w-[360px]" role="img" aria-label={`From ${points[0]} to ${last}`}>
        <path d={d} fill="none" stroke="currentColor" strokeWidth={2} className="text-signal-text" />
        {xy.length > 0 && <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r={3.5} className="fill-current text-signal-text" />}
      </svg>
      <span className="font-mono text-[13px] text-fg">
        {last}
        <span className="block text-[11px] text-fg-3">
          {min}–{max}
        </span>
      </span>
    </div>
  );
}

function Message({ beat, cast }: { beat: Exclude<Beat, { kind: "decision" }>; cast: CastMember[] }) {
  if (beat.kind === "msg" && beat.who === "note") {
    return <p className="m-0 px-2 py-1 text-center text-[14px] italic text-fg-3" dangerouslySetInnerHTML={{ __html: beat.html }} />;
  }
  if (beat.kind === "msg" && (beat.who === "pager" || beat.who === "status")) {
    const pager = beat.who === "pager";
    return (
      <div className={`flex flex-col gap-1 border px-4 py-3 ${pager ? "border-bad bg-bad/10" : "border-line-strong bg-surface"}`}>
        <span className={`${LABEL} ${pager ? "text-bad" : "text-fg-3"}`}>
          {pager ? "🔔 page" : "status page"} · {beat.at}
        </span>
        <span className="text-[15px] font-semibold leading-snug text-fg" dangerouslySetInnerHTML={{ __html: beat.html }} />
      </div>
    );
  }
  if (beat.kind === "chart" || beat.kind === "log") {
    return (
      <div className="ml-12 flex flex-col gap-2 border border-line bg-surface px-4 py-3">
        <span className={`${LABEL} text-fg-3`}>
          {beat.kind === "chart" ? "📈" : "▤"} {beat.title} · {beat.at}
        </span>
        {beat.kind === "chart" ? (
          <Spark points={beat.points} />
        ) : (
          <pre className="m-0 overflow-x-auto whitespace-pre font-mono text-[12px] leading-relaxed text-fg-2">{beat.lines.join("\n")}</pre>
        )}
      </div>
    );
  }
  const who = speakerOf(beat.who, cast);
  return (
    <div className="flex gap-3">
      <Avatar who={who} />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
          <strong className="font-semibold text-fg">{who?.name ?? beat.who}</strong>
          {who && <span className="text-fg-3">{who.role}</span>}
          <span className="font-mono text-[11px] text-fg-4">{beat.at}</span>
        </span>
        <span className="text-[15px] leading-relaxed text-fg-2 [&_code]:bg-surface-2 [&_code]:px-1 [&_code]:font-mono [&_code]:text-[13px]" dangerouslySetInnerHTML={{ __html: beat.html }} />
      </div>
    </div>
  );
}

/** Authors list the best move first; show the options in a fixed shuffled order per decision. */
function order(n: number, seed: string): number[] {
  let h = 2166136261;
  for (let k = 0; k < seed.length; k++) h = Math.imul(h ^ seed.charCodeAt(k), 16777619);
  const idx = Array.from({ length: n }, (_, k) => k);
  for (let k = n - 1; k > 0; k--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const j = h % (k + 1);
    [idx[k], idx[j]] = [idx[j], idx[k]];
  }
  return idx;
}

function Decision({
  beat,
  picks,
  cast,
  onPick,
  open,
  seed,
}: {
  beat: Extract<Beat, { kind: "decision" }>;
  picks: Pick[];
  cast: CastMember[];
  onPick: (i: number) => void;
  open: boolean;
  seed: string;
}) {
  const tried = new Set(picks.map((p) => p.option));
  const shown = order(beat.options.length, seed);
  return (
    <div className={`flex flex-col gap-3 border p-4 sm:p-5 ${open ? "border-signal bg-surface" : "border-line bg-bg"}`}>
      <span className={`${LABEL} ${open ? "text-signal-text" : "text-fg-3"}`}>your call</span>
      <p className="m-0 text-[16px] font-semibold leading-snug text-fg" dangerouslySetInnerHTML={{ __html: beat.question }} />
      <div className="flex flex-col gap-2">
        {shown.map((i) => {
          const o = beat.options[i];
          const was = tried.has(i);
          const cost = [o.minutes ? `+${o.minutes} min` : "", o.users ? `+${o.users.toLocaleString("en-IN")} users` : ""].filter(Boolean).join(" · ");
          if (!open && !was) return null;
          return (
            <button
              key={i}
              type="button"
              disabled={!open || was}
              onClick={() => onPick(i)}
              className={`flex min-h-12 items-start justify-between gap-3 border px-4 py-3 text-left text-[15px] leading-snug ${
                was ? (o.best ? "border-ok bg-ok/10 text-fg" : "border-bad/60 bg-bad/5 text-fg-3 line-through decoration-bad/60") : "border-line-strong text-fg hover:border-signal"
              } disabled:cursor-default`}
            >
              <span dangerouslySetInnerHTML={{ __html: o.html }} />
              {was && <span className={`shrink-0 font-mono text-[12px] no-underline ${o.best ? "text-ok" : "text-bad"}`}>{o.best ? "✓ right call" : cost || "✗"}</span>}
            </button>
          );
        })}
      </div>
      {picks.map((p) => (
        <div key={p.option} className="flex flex-col gap-2 border-l-2 border-line-strong pl-3">
          {beat.options[p.option].replies.map((r, k) => {
            const who = speakerOf(r.who, cast);
            return (
              <p key={k} className="m-0 text-[14px] leading-relaxed text-fg-2">
                {r.who && <strong className="text-fg">{who?.name ?? r.who}: </strong>}
                <span dangerouslySetInnerHTML={{ __html: r.html }} />
              </p>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function rating(wrong: number): { title: string; line: string } {
  if (wrong === 0) return { title: "Calm under fire", line: "Every call right the first time. That is what a good incident commander wants from on-call." };
  if (wrong <= 2) return { title: "Got there", line: "A wrong turn or two, then the right call. Most real incidents look like this." };
  return { title: "Rough night", line: "Lots of minutes lost to plausible-looking moves. Read the postmortem, then play it again." };
}

export default function WarRoomPlayer({ room }: { room: WarRoom }) {
  const { awardOnce } = useGame();
  const [shown, setShown] = useState(0);
  const [picks, setPicks] = useState<Record<number, Pick[]>>({});
  const [fast, setFast] = useState(false);
  const [started, setStarted] = useState(false);
  const [gained, setGained] = useState<number | null>(null);
  // best run in this browser (saveRun fires WAR_EVENT, so a finished run updates it)
  const bestRaw = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(readRuns()[room.slug] ?? null),
    () => "null",
  );
  const best = JSON.parse(bestRaw) as { wrong: number } | null;
  const endRef = useRef<HTMLDivElement>(null);
  const finishedRef = useRef(false);

  const beats = room.beats;
  const resolved = (i: number) => (picks[i] || []).some((p) => beats[i].kind === "decision" && (beats[i] as Extract<Beat, { kind: "decision" }>).options[p.option].best);
  const waiting = shown > 0 && beats[shown - 1]?.kind === "decision" && !resolved(shown - 1);
  const done = shown >= beats.length && !waiting;

  const totals = useMemo(() => {
    let minutes = 0;
    let users = 0;
    let wrong = 0;
    for (const [i, ps] of Object.entries(picks)) {
      const b = beats[Number(i)];
      if (b.kind !== "decision") continue;
      for (const p of ps) {
        const o = b.options[p.option];
        if (o.best) continue;
        wrong++;
        minutes += o.minutes;
        users += o.users;
      }
    }
    return { minutes, users, wrong };
  }, [picks, beats]);

  // reveal the next beat after a pause sized to the message
  useEffect(() => {
    if (!started || waiting || shown >= beats.length) return;
    const next = beats[shown];
    const len = next.kind === "msg" ? next.html.length : next.kind === "log" ? 120 : next.kind === "chart" ? 80 : 40;
    const delay = fast ? 120 : shown === 0 ? 300 : Math.min(2600, 700 + len * 14);
    const id = window.setTimeout(() => setShown((s) => s + 1), delay);
    return () => window.clearTimeout(id);
  }, [started, waiting, shown, beats, fast]);

  useEffect(() => {
    if (started) endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [shown, picks, started]);

  useEffect(() => {
    if (!done || !started || finishedRef.current) return;
    finishedRef.current = true;
    const id = window.setTimeout(() => {
      setGained(awardOnce(warRoomKey(room.slug), WAR_ROOM_XP, `War room cleared · ${room.title}`));
      saveRun(room.slug, totals.wrong);
      track("war_room_done", { slug: room.slug, wrong: totals.wrong });
    }, 0);
    return () => window.clearTimeout(id);
  }, [done, started, awardOnce, room.slug, room.title, totals.wrong]);

  const pick = useCallback(
    (i: number, option: number) => {
      setPicks((p) => ({ ...p, [i]: [...(p[i] || []), { option }] }));
    },
    [],
  );

  const skip = () => {
    // reveal everything up to (and including) the next decision
    let k = shown;
    while (k < beats.length && beats[k].kind !== "decision") k++;
    setShown(Math.min(beats.length, k + 1));
  };

  const restart = () => {
    finishedRef.current = false;
    setPicks({});
    setShown(0);
    setGained(null);
    setStarted(true);
  };

  const clock = (() => {
    for (let k = shown - 1; k >= 0; k--) {
      const b = beats[k];
      if (b.kind !== "decision") return b.at;
    }
    return room.starts;
  })();

  if (!started) {
    return (
      <div className="flex flex-col gap-5 border border-signal bg-surface p-5 sm:p-7">
        <span className={`${LABEL} text-signal-text`}>you&apos;re on call tonight</span>
        <p className="m-0 max-w-[60ch] text-[16px] leading-relaxed text-fg-2">
          {room.product ? `${room.company} runs ${room.product}. ` : ""}It&apos;s {room.starts}. The channel fills up as the night goes on; at {room.decisions} points you make the call. A wrong
          move costs minutes and users, and someone tells you why.
        </p>
        <div className="flex flex-col gap-2">
          <span className={`${LABEL} text-fg-3`}>in the channel</span>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {room.cast.map((c) => (
              <li key={c.id} className="flex items-center gap-2 border border-line px-2.5 py-1.5">
                <Avatar who={c} />
                <span className="flex flex-col text-[13px] leading-tight">
                  <strong className="font-semibold text-fg">{c.name}</strong>
                  <span className="text-fg-3">{c.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setStarted(true)} className="min-h-12 bg-signal px-6 text-[15px] font-semibold text-on-signal hover:brightness-110">
            Take the page →
          </button>
          <span className="font-mono text-xs text-fg-3">
            ~{room.minutes} min · {room.decisions} calls · +{WAR_ROOM_XP} XP{best ? ` · your best: ${best.wrong} wrong call${best.wrong === 1 ? "" : "s"}` : ""}
          </span>
        </div>
      </div>
    );
  }

  const r = rating(totals.wrong);
  return (
    <div className="flex flex-col gap-6">
      {/* channel header */}
      <div className="sticky top-[var(--hk-header-h,56px)] z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-line-strong bg-bg/95 px-4 py-2.5 backdrop-blur">
        <span className="font-mono text-[13px] text-fg">
          <span className="bg-bad px-1.5 py-0.5 font-semibold text-white">{room.sev}</span> #inc-{room.slug.slice(0, 22)}
        </span>
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-fg-3">
          <span>⏱ {clock}</span>
          <span className={totals.minutes ? "text-bad" : ""}>lost {totals.minutes} min</span>
          <span className={totals.users ? "text-bad" : ""}>+{totals.users.toLocaleString("en-IN")} users hurt</span>
        </span>
      </div>

      <div role="log" aria-live="polite" aria-label="Incident channel" className="flex flex-col gap-4">
        {beats.slice(0, shown).map((b, i) =>
          b.kind === "decision" ? (
            <Decision key={i} beat={b} picks={picks[i] || []} cast={room.cast} open={!resolved(i)} onPick={(o) => pick(i, o)} seed={`${room.slug}:${i}`} />
          ) : (
            <Message key={i} beat={b} cast={room.cast} />
          ),
        )}
        {!done && !waiting && shown < beats.length && <p className="m-0 animate-pulse pl-12 font-mono text-[12px] text-fg-4">typing…</p>}
        <div ref={endRef} />
      </div>

      {!done && (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setFast((f) => !f)} aria-pressed={fast} className="min-h-10 border border-line-strong px-3.5 font-mono text-xs text-fg-2 hover:text-fg">
            {fast ? "▶▶ fast" : "▶ normal speed"}
          </button>
          {!waiting && (
            <button type="button" onClick={skip} className="min-h-10 border border-line-strong px-3.5 font-mono text-xs text-fg-2 hover:text-fg">
              skip to the next call ↓
            </button>
          )}
        </div>
      )}

      {done && (
        <section aria-label="Debrief" className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 border border-signal bg-surface p-5 sm:p-7">
            <span className={`${LABEL} text-signal-text`}>incident closed · your run</span>
            <h2 className="m-0 font-display text-[clamp(30px,5vw,44px)] font-extrabold leading-none tracking-[-0.03em] text-fg">
              {r.title}
              <span className="text-signal-text">.</span>
            </h2>
            <p className="m-0 max-w-[60ch] text-[15px] text-fg-2">{r.line}</p>
            <p className="m-0 font-mono text-[13px] text-fg-2">
              {totals.wrong} wrong call{totals.wrong === 1 ? "" : "s"} · {totals.minutes} min lost · +{totals.users.toLocaleString("en-IN")} users hurt
              {gained ? ` · +${gained} XP` : ""}
              {best && best.wrong < totals.wrong ? ` · your best ${best.wrong}` : ""}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button type="button" onClick={restart} className="min-h-11 border border-line-strong px-4 text-sm font-medium text-fg hover:border-fg-3">
                Play it again
              </button>
              <Link href="/learn/war-stories" className="inline-flex min-h-11 items-center border border-line-strong px-4 text-sm font-medium text-fg-2 hover:border-fg-3 hover:text-fg">
                All war stories
              </Link>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="m-0 font-display text-[28px] font-bold tracking-[-0.02em] text-fg">Postmortem</h2>
            <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: room.postmortemHtml }} />
          </div>

          <div className="flex flex-col gap-3 border border-line-strong bg-surface p-5 sm:p-6">
            <span className={`${LABEL} text-fg-3`}>the real incident · {room.basedOn}</span>
            <div className="course-content max-w-none" dangerouslySetInnerHTML={{ __html: room.realHtml }} />
            <a href={room.basedOnUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-signal-text underline underline-offset-4">
              read the real postmortem ↗
            </a>
          </div>

          {room.lesson && (
            <Link href={room.lesson.href} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-surface p-4 hover:border-fg-3 sm:px-5">
              <span className="flex flex-col gap-1">
                <span className={`${LABEL} text-fg-3`}>the lesson behind it · {room.lesson.code}</span>
                <span className="text-[16px] font-semibold text-fg">{room.lesson.title}</span>
              </span>
              <span className="font-mono text-sm text-signal-text">read it →</span>
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
