/**
 * The interview loop as pure functions over MockRun: entering a phase, prompts arriving on the
 * phase clock, prompts waiting for "Done", the interviewer's own time-keeping nudges, and the
 * transcript the room shows. Client-safe, no React.
 */
import type { MockInterview, MockMessage, MockPhase } from "./types";
import type { MockRun } from "./store";
import { words, type RoundFacts } from "./score";

export type FeedItem = {
  id: string;
  /** overall seconds when it arrived */
  at: number;
  phase: number;
  kind: "enter" | "say" | "curveball" | "hint" | "auto";
  html: string;
  text: string;
  title?: string;
};

export const totalUsed = (mock: MockInterview, run: MockRun) => mock.phases.reduce((a, p) => a + (run.used[p.id] || 0), 0);

export const firstName = (name: string) => name.replace(/^(dr|mr|ms|mrs)\.?\s+/i, "").split(/\s+/)[0] || name;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const para = (s: string) => `<p>${esc(s)}</p>`;

/** The interviewer keeping time, like a real one would. */
export function autoMessages(mock: MockInterview, p: MockPhase): { id: string; sec: number; text: string }[] {
  const next = mock.phases[p.n];
  const out = [
    {
      id: `auto.${p.id}.time`,
      sec: p.minutes * 60,
      text: next
        ? `We're at about ${p.minutes} minutes on ${p.title.toLowerCase()}. Start wrapping this part up; next I'd like to hear about ${next.title.toLowerCase()}.`
        : "We're about at time. Let's bring it to a close.",
    },
  ];
  if (next) out.push({ id: `auto.${p.id}.move`, sec: Math.round(p.minutes * 90), text: `Let's move on to ${next.title.toLowerCase()}. I want to make sure we get through everything.` });
  return out;
}

export const TOTAL_AUTO = "auto.total";

/** Move to phase k: record it, fire its opening prompts. */
export function enterPhase(mock: MockInterview, run: MockRun, k: number): MockRun {
  const p = mock.phases[k];
  if (!p) return run;
  const at = totalUsed(mock, run);
  const fired = { ...run.fired };
  if (fired[`enter.${p.id}`] === undefined) fired[`enter.${p.id}`] = at;
  [...p.prompts, ...p.curveballs].forEach((m) => {
    if (m.trigger.kind === "start" && fired[m.id] === undefined) fired[m.id] = at;
  });
  return { ...run, phase: k, maxPhase: Math.max(run.maxPhase, k), fired };
}

/** Prompts due on the clock in the current phase (null when nothing new). */
export function dueOnClock(mock: MockInterview, run: MockRun): Record<string, number> | null {
  const p = mock.phases[run.phase];
  if (!p) return null;
  const used = run.used[p.id] || 0;
  const at = totalUsed(mock, run);
  const add: Record<string, number> = {};
  [...p.prompts, ...p.curveballs].forEach((m) => {
    if (m.trigger.kind === "at" && m.trigger.sec <= used && run.fired[m.id] === undefined) add[m.id] = at;
  });
  if (!run.submitted[p.id]) autoMessages(mock, p).forEach((a) => {
    if (a.sec <= used && run.fired[a.id] === undefined) add[a.id] = at;
  });
  if (at >= mock.minutes * 60 && run.fired[TOTAL_AUTO] === undefined) add[TOTAL_AUTO] = at;
  return Object.keys(add).length ? add : null;
}

/**
 * Prompts waiting for the candidate's first "Done" in phase k: the [submit] ones, plus any
 * curveball whose time hadn't come yet (an interviewer with a curveball planned still asks it).
 */
export function pendingOnSubmit(mock: MockInterview, run: MockRun, k: number): MockMessage[] {
  const p = mock.phases[k];
  if (!p || run.submitted[p.id]) return [];
  const unfired = (m: MockMessage) => run.fired[m.id] === undefined;
  return [...p.prompts.filter((m) => m.trigger.kind === "submit"), ...p.curveballs.filter((m) => m.trigger.kind !== "start")].filter(unfired);
}

/** Curveballs that have arrived in phase k. */
export const firedCurveballs = (p: MockPhase, run: MockRun) => p.curveballs.filter((c) => run.fired[c.id] !== undefined);

export const hintId = (p: MockPhase, i: number) => `${p.id}.h${i + 1}`;

/** The transcript: everything that has arrived, in order. */
export function transcript(mock: MockInterview, run: MockRun): FeedItem[] {
  const items: FeedItem[] = [];
  const name = firstName(mock.interviewer.name);
  mock.phases.forEach((p) => {
    const enter = run.fired[`enter.${p.id}`];
    if (enter === undefined) return;
    items.push({ id: `enter.${p.id}`, at: enter, phase: p.n, kind: "enter", html: "", text: `Phase ${p.n} · ${p.title}` });
    p.prompts.forEach((m) => run.fired[m.id] !== undefined && items.push({ id: m.id, at: run.fired[m.id], phase: p.n, kind: "say", html: m.html, text: m.text }));
    p.curveballs.forEach((m) => run.fired[m.id] !== undefined && items.push({ id: m.id, at: run.fired[m.id], phase: p.n, kind: "curveball", html: m.html, text: m.text, title: m.title }));
    p.hints.forEach((h, i) => {
      const at = run.fired[hintId(p, i)];
      if (at !== undefined) items.push({ id: hintId(p, i), at, phase: p.n, kind: "hint", html: h.html, text: h.text });
    });
    autoMessages(mock, p).forEach((a) => {
      const at = run.fired[a.id];
      if (at !== undefined) items.push({ id: a.id, at, phase: p.n, kind: "auto", html: para(a.text), text: `${name}: ${a.text}` });
    });
  });
  const t = run.fired[TOTAL_AUTO];
  if (t !== undefined) items.push({ id: TOTAL_AUTO, at: t, phase: 0, kind: "auto", html: para("That's our time. Finish your thought, then let's wrap up."), text: "That's our time." });
  // chronological; a phase divider before anything that arrived at the same second
  const order = new Map(items.map((it, i) => [it.id, i]));
  return items.sort((a, b) => a.at - b.at || (a.kind === "enter" ? -1 : 0) - (b.kind === "enter" ? -1 : 0) || order.get(a.id)! - order.get(b.id)!);
}

export function roundFacts(mock: MockInterview, run: MockRun): RoundFacts {
  const w: Record<string, number> = {};
  const cb: Record<string, number> = {};
  const used: Record<string, number> = {};
  mock.phases.forEach((p) => {
    w[p.id] = words(run.notes[p.id] || "");
    used[p.id] = run.used[p.id] || 0;
    firedCurveballs(p, run).forEach((c) => (cb[c.id] = words(run.answers[c.id] || "")));
  });
  return { words: w, curveballs: cb, used, hints: Object.values(run.hints).reduce((a, b) => a + b, 0), pauses: run.pauses, budgetSec: mock.minutes * 60 };
}

export function placeholderFor(title: string): string {
  const t = title.toLowerCase();
  if (/clarif|requirement|scope/.test(t)) return "The questions you'd ask, one per line. Then your assumptions and the requirements you'll design for.";
  if (/estimat|number|capacity|sizing/.test(t)) return "Show the maths: per day → per second, the peak, storage. Round freely and write the conclusion each number leads to.";
  if (/api|data model|schema/.test(t)) return "Endpoints with request/response shapes, then tables, keys and indexes.";
  if (/high-level|architecture|design$/.test(t)) return "The components and the path of one request through them. Use the whiteboard tab for boxes and arrows.";
  if (/deep/.test(t)) return "Go deep on the hardest part: the algorithm, the failure cases, the guarantees and how you keep them.";
  if (/bottleneck|trade/.test(t)) return "What breaks first, what you'd change, and what you're trading away.";
  if (/production|operation|running|reliab/.test(t)) return "SLOs, rollout, monitoring, and how you'd run the incident.";
  if (/wrap|summary|close/.test(t)) return "A 60-second summary, what you'd do next, and your questions for the interviewer.";
  return "Think out loud: bullets, numbers and decisions with their reasons.";
}
