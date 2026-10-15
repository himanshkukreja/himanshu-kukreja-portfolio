"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { StepCtx } from "./types";

/* ------------------------------------------------------------------ shared bits */

export const BTN_PRIMARY =
  "inline-flex min-h-12 items-center justify-center gap-2 bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45";
export const BTN_GHOST =
  "inline-flex min-h-12 items-center justify-center gap-2 border border-line-strong bg-transparent px-4 font-mono text-[13px] text-fg hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45";
/** An answer / option button. State classes are added by the caller. */
export const OPTION =
  "flex min-h-12 w-full items-center gap-3 border px-3.5 py-2.5 text-left text-[15px] leading-[1.4] disabled:cursor-default";
export const OPT_IDLE = "border-line-strong bg-bg text-fg enabled:hover:border-fg-3 enabled:hover:bg-surface-2";
export const OPT_RIGHT = "border-signal bg-signal text-on-signal";
export const OPT_WRONG = "border-bad bg-bg text-fg";
export const OPT_DIM = "border-line bg-bg text-fg-3";

const subscribeReduced = (cb: () => void) => {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

/** prefers-reduced-motion, SSR-safe (false on the server). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

/** Deterministic shuffle (same on server and client), never returns the input order for n > 1. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const out = items.map((v, i) => ({ v, i }));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((o, k) => o.i === k)) out.push(out.shift()!);
  return out.map((o) => o.v);
}

export function StepPrompt({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="m-0 font-display text-[21px] font-bold leading-[1.2] tracking-[-0.02em] text-fg sm:text-[24px]">{children}</p>
      {sub && <p className="m-0 text-[14px] leading-relaxed text-fg-3">{sub}</p>}
    </div>
  );
}

export function Feedback({ ok, title, children }: { ok: boolean | null; title: ReactNode; children?: ReactNode }) {
  const tone = ok === null ? "border-line-strong" : ok ? "border-signal" : "border-bad";
  const tag = ok === null ? "NOTE" : ok ? "CORRECT" : "NOT QUITE";
  return (
    <div className={`flex flex-col gap-1.5 border-l-[3px] ${tone} bg-surface-2 px-4 py-3`}>
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`font-mono text-[11px] font-semibold tracking-label ${ok === false ? "text-bad-text" : ok ? "text-signal-text" : "text-fg-3"}`}>
          {tag}
        </span>
        <span className="text-[15px] font-semibold text-fg">{title}</span>
      </span>
      {children && <div className="text-[14.5px] leading-relaxed text-fg-2">{children}</div>}
    </div>
  );
}

function Key({ k }: { k: number }) {
  return (
    <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center border border-current font-mono text-[12px] font-semibold">
      {String.fromCharCode(65 + k)}
    </span>
  );
}

/* ------------------------------------------------------------------ multiple choice */

export function ChoiceStep({
  ctx,
  prompt,
  sub,
  options,
  answer,
  explain,
}: {
  ctx: StepCtx;
  prompt: ReactNode;
  sub?: ReactNode;
  options: string[];
  answer: number;
  explain: ReactNode;
}) {
  const [pick, setPick] = useState<number | null>(null);
  // Display order is a deterministic shuffle of the authored order (same on server and client), so the right
  // answer doesn't sit in the same slot step after step and "always B" is not a strategy. The salt was picked so no
  // activity has two questions with the answer in the same slot (checked over every ChoiceStep in this folder).
  const [order] = useState(() => seededShuffle(options.map((_, i) => i), `${options.join("|")}#44`));
  const answered = pick !== null;
  const choose = (k: number) => {
    if (answered) return;
    setPick(k);
    ctx.done(k === answer ? 1 : 0);
  };
  const letter = (k: number) => String.fromCharCode(65 + order.indexOf(k));
  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub={sub}>{prompt}</StepPrompt>
      <div className="flex flex-col gap-2" role="group" aria-label="Answers">
        {order.map((k, pos) => {
          const t = options[k];
          const cls = !answered ? OPT_IDLE : k === answer ? OPT_RIGHT : k === pick ? OPT_WRONG : OPT_DIM;
          return (
            <button key={t} type="button" disabled={answered} onClick={() => choose(k)} aria-pressed={pick === k} className={`${OPTION} ${cls}`}>
              <Key k={pos} />
              <span className="sr-only">Option {String.fromCharCode(65 + pos)}: </span>
              <span className="grow">{t}</span>
              {answered && k === answer && <span className="shrink-0 font-mono text-[11px]">✓</span>}
              {answered && k === pick && k !== answer && <span className="shrink-0 font-mono text-[11px] text-bad-text">✗</span>}
            </button>
          );
        })}
      </div>
      <div aria-live="polite">
        {answered && (
          <Feedback ok={pick === answer} title={pick === answer ? "Right call." : `The answer is ${letter(answer)}.`}>
            {explain}
          </Feedback>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ classify (one card at a time) */

export type ClassifyItem = { text: ReactNode; label: string; bucket: string; explain: ReactNode };
export type Bucket = { id: string; label: string; hint?: string };

export function ClassifyStep({
  ctx,
  prompt,
  sub,
  buckets,
  items,
}: {
  ctx: StepCtx;
  prompt: ReactNode;
  sub?: ReactNode;
  buckets: Bucket[];
  items: ClassifyItem[];
}) {
  const [k, setK] = useState(0);
  const [picks, setPicks] = useState<string[]>([]);
  const cur = items[Math.min(k, items.length - 1)];
  const answered = picks.length > k;
  const pick = picks[k];
  const right = answered && pick === cur.bucket;
  const last = k >= items.length - 1;

  const choose = (b: string) => {
    if (answered) return;
    const next = [...picks, b];
    setPicks(next);
    if (next.length === items.length) ctx.done(next.filter((p, i) => p === items[i].bucket).length);
  };

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub={sub}>{prompt}</StepPrompt>
      <ol className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="Items">
        {items.map((it, i) => {
          const done = i < picks.length;
          const ok = done && picks[i] === it.bucket;
          return (
            <li
              key={it.label}
              aria-label={`${it.label}: ${done ? (ok ? "correct" : "wrong") : i === k ? "current" : "pending"}`}
              className={`grid h-7 min-w-7 place-items-center px-1.5 font-mono text-[11px] ${
                done ? (ok ? "bg-signal text-on-signal" : "border border-bad text-bad-text") : i === k ? "border-2 border-fg text-fg" : "border border-line-strong text-fg-3"
              }`}
            >
              {done ? (ok ? "✓" : "✗") : i + 1}
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-3 border border-line-strong bg-bg p-4">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">
          {Math.min(k + 1, items.length)} / {items.length}
        </span>
        <div className="text-[16px] font-semibold leading-snug text-fg">{cur.text}</div>
      </div>
      <div className={`grid gap-2 ${buckets.length > 2 ? "sm:grid-cols-2" : "grid-cols-2"}`} role="group" aria-label="Choose a bucket">
        {buckets.map((b) => {
          const cls = !answered ? OPT_IDLE : b.id === cur.bucket ? OPT_RIGHT : b.id === pick ? OPT_WRONG : OPT_DIM;
          return (
            <button key={b.id} type="button" disabled={answered} onClick={() => choose(b.id)} aria-pressed={pick === b.id} className={`${OPTION} ${cls} flex-col !items-start !gap-0.5`}>
              <span className="font-semibold">{b.label}</span>
              {b.hint && <span className="font-mono text-[11px] opacity-80">{b.hint}</span>}
            </button>
          );
        })}
      </div>
      <div aria-live="polite" className="flex flex-col gap-3">
        {answered && (
          <Feedback ok={right} title={right ? "Right bucket." : `It goes in “${buckets.find((b) => b.id === cur.bucket)?.label}”.`}>
            {cur.explain}
          </Feedback>
        )}
        {answered && !last && (
          <button type="button" onClick={() => setK(k + 1)} className={`${BTN_GHOST} self-start`}>
            next item →
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ order (tap to place) */

export type OrderItem = { id: string; text: string; note?: string };

export function OrderStep({ ctx, prompt, sub, items, seed }: { ctx: StepCtx; prompt: ReactNode; sub?: ReactNode; items: OrderItem[]; seed: string }) {
  const [pool] = useState(() => seededShuffle(items, seed));
  const [placed, setPlaced] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  const full = placed.length === items.length;
  const score = placed.filter((id, i) => items[i].id === id).length;

  const place = (id: string) => {
    if (checked || placed.includes(id)) return;
    setPlaced([...placed, id]);
  };
  const remove = (id: string) => {
    if (checked) return;
    setPlaced(placed.filter((p) => p !== id));
  };
  const check = () => {
    if (!full || checked) return;
    setChecked(true);
    ctx.done(score);
  };

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub={sub ?? "Tap the steps in order. Tap a placed step to send it back."}>{prompt}</StepPrompt>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Your order">
        {items.map((_, i) => {
          const id = placed[i];
          const it = id ? byId[id] : null;
          const ok = checked && it && items[i].id === id;
          return (
            <li key={i} className="flex items-stretch gap-2">
              <span
                aria-hidden
                className={`grid w-9 shrink-0 place-items-center font-mono text-[13px] ${
                  checked ? (ok ? "bg-signal text-on-signal" : "border border-bad text-bad-text") : it ? "bg-fg text-bg" : "border border-dashed border-line-strong text-fg-3"
                }`}
              >
                {checked ? (ok ? "✓" : "✗") : i + 1}
              </span>
              {it ? (
                <button
                  type="button"
                  onClick={() => remove(it.id)}
                  disabled={checked}
                  aria-label={`Step ${i + 1}: ${it.text}${checked ? (ok ? ", correct" : ", wrong position") : ". Tap to remove"}`}
                  className={`flex min-h-12 grow flex-col justify-center border px-3 py-2 text-left text-[15px] leading-snug disabled:cursor-default ${
                    checked ? (ok ? "border-signal bg-bg text-fg" : "border-bad bg-bg text-fg") : "border-line-strong bg-surface text-fg hover:border-fg-3"
                  }`}
                >
                  <span>{it.text}</span>
                  {checked && !ok && <span className="font-mono text-[11px] text-fg-3">should be: {items[i].text}</span>}
                </button>
              ) : (
                <span className="flex min-h-12 grow items-center border border-dashed border-line px-3 text-[14px] text-fg-4">empty</span>
              )}
            </li>
          );
        })}
      </ol>
      {!checked && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">{full ? "All placed" : "Pick the next step"}</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {pool
              .filter((it) => !placed.includes(it.id))
              .map((it) => (
                <button key={it.id} type="button" onClick={() => place(it.id)} className={`${OPTION} ${OPT_IDLE}`}>
                  <span aria-hidden className="font-mono text-signal-text">+</span>
                  <span className="grow">{it.text}</span>
                </button>
              ))}
          </div>
          <button type="button" onClick={check} disabled={!full} className={`${BTN_PRIMARY} self-start`}>
            check order
          </button>
        </div>
      )}
      <div aria-live="polite">
        {checked && (
          <Feedback ok={score === items.length} title={`${score} of ${items.length} in the right place.`}>
            <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
              {items.map((it) => (
                <li key={it.id}>
                  <span className="font-semibold text-fg">{it.text}</span>
                  {it.note && <span> · {it.note}</span>}
                </li>
              ))}
            </ol>
          </Feedback>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ spot the bug (tap lines) */

export type SpotLine = { code: string; faulty?: boolean; /** not scored either way */ neutral?: boolean; note?: string };

export function SpotStep({ ctx, prompt, sub, file, lines }: { ctx: StepCtx; prompt: ReactNode; sub?: ReactNode; file: string; lines: SpotLine[] }) {
  const [sel, setSel] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const faulty = lines.map((l, i) => (l.faulty ? i : -1)).filter((i) => i >= 0);
  const hits = sel.filter((i) => lines[i].faulty).length;
  const misses = sel.filter((i) => !lines[i].faulty && !lines[i].neutral).length;
  const score = Math.max(0, hits - misses);

  const toggle = (i: number) => {
    if (checked) return;
    setSel(sel.includes(i) ? sel.filter((s) => s !== i) : [...sel, i]);
  };
  const check = () => {
    if (!sel.length || checked) return;
    setChecked(true);
    ctx.done(score);
  };

  return (
    <div className="flex flex-col gap-4">
      <StepPrompt sub={sub}>{prompt}</StepPrompt>
      <div className="border border-line-strong bg-bg">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2 font-mono text-[11px] text-fg-3">
          <span>{file}</span>
          <span>{checked ? `${hits}/${faulty.length} found` : `${sel.length} flagged`}</span>
        </div>
        <ol className="m-0 flex list-none flex-col p-0" aria-label={`${file}, tap a line to flag it`}>
          {lines.map((l, i) => {
            const on = sel.includes(i);
            const reveal = checked && (l.faulty || on);
            const tone = !checked
              ? on
                ? "bg-signal/15 border-l-signal"
                : "border-l-transparent hover:bg-surface-2"
              : l.faulty
                ? "bg-signal/15 border-l-signal"
                : on
                  ? "bg-bad/10 border-l-bad"
                  : "border-l-transparent";
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  disabled={checked}
                  aria-pressed={on}
                  className={`flex min-h-11 w-full items-start gap-2.5 border-l-[3px] px-2 py-2 text-left disabled:cursor-default ${tone}`}
                >
                  <span aria-hidden className="w-5 shrink-0 select-none pt-px text-right font-mono text-[11px] text-fg-4">
                    {i + 1}
                  </span>
                  <span className="flex min-w-0 grow flex-col gap-1">
                    <code className="whitespace-pre-wrap break-words font-mono text-[13px] leading-[1.55] text-fg">{l.code}</code>
                    {reveal && l.note && (
                      <span className={`font-sans text-[13px] leading-snug ${l.faulty ? "text-signal-text" : "text-fg-3"}`}>
                        {l.faulty ? (on ? "✓ " : "missed · ") : "✗ "}
                        {l.note}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      {!checked && (
        <button type="button" onClick={check} disabled={!sel.length} className={`${BTN_PRIMARY} self-start`}>
          flag {sel.length || ""} line{sel.length === 1 ? "" : "s"} as the bug
        </button>
      )}
      <div aria-live="polite">
        {checked && (
          <Feedback ok={score === faulty.length} title={`${hits} of ${faulty.length} found${misses ? `, ${misses} false alarm${misses === 1 ? "" : "s"}` : ""}.`} />
        )}
      </div>
    </div>
  );
}
