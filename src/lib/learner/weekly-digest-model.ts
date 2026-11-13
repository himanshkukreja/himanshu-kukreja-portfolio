/**
 * The weekly progress email, pure part (owner-approved 13 Nov 2026): the facts of a learner's week and the email's HTML.
 * Facts are counts, course topic names, level words and links only: never chat, notes, memory or answer text. The server
 * side (./weekly-digest.ts) gathers them; the Haiku paragraph (FEATURES "weekly-digest") is written from `factsText`.
 */
import { levelLabel, rankOf, type OutcomeEvent } from "./events-model";

export const DIGEST_DAYS = 7;
const DAY = 86_400_000;

export type NextStep = { label: string; href: string; why: string };
export type Slip = { label: string; href: string; misses: number };

export type DigestFacts = {
  /** "7 Nov – 13 Nov" */
  range: string;
  /** the learner's memory is on, so outcome-based sections are filled */
  withOutcomes: boolean;
  did: { lessons: number; labs: number; mocks: number; dsaSolved: number; explains: number };
  /** what stuck: passes and level-ups, as short phrases */
  stuck: string[];
  /** repeated misses, as topics only */
  slipped: Slip[];
  next: NextStep[];
};

export const didTotal = (d: DigestFacts["did"]) => d.lessons + d.labs + d.mocks + d.dsaSolved + d.explains;

/** Counts from the week's outcomes (events newer than `since`), and the level-ups against what came before. */
export function weekOutcomes(events: OutcomeEvent[], since: number, mockTitle: (ref: string) => string): { labs: number; mocks: number; dsaSolved: number; explains: number; stuck: string[] } {
  const week = events.filter((e) => e.at >= since);
  const labs = new Set(week.filter((e) => e.kind === "lab_pass").map((e) => e.ref));
  const dsa = new Set(week.filter((e) => e.kind === "dsa_submit" && e.outcome === "AC").map((e) => e.ref));
  const mocksW = week.filter((e) => e.kind === "mock_overall" || e.kind === "lld_mock");
  const explains = week.filter((e) => e.kind === "explain_back");
  const stuck: string[] = [];
  if (labs.size) stuck.push(`${labs.size} lab${labs.size === 1 ? "" : "s"} passed`);
  if (dsa.size) stuck.push(`${dsa.size} DSA problem${dsa.size === 1 ? "" : "s"} accepted`);
  const solid = explains.filter((e) => e.outcome === "solid").length;
  if (solid) stuck.push(`${solid} explain-back${solid === 1 ? "" : "s"} rated solid`);
  // a level-up: this week's best level on a mock beats the best before the week
  const prior = events.filter((e) => e.at < since && (e.kind === "mock_overall" || e.kind === "lld_mock"));
  const bestBefore = (ref: string) => Math.max(-1, ...prior.filter((p) => p.ref === ref).map((p) => rankOf(p.kind, p.outcome) ?? -1));
  const seen = new Set<string>();
  for (const e of [...mocksW].sort((a, b) => (rankOf(b.kind, b.outcome) ?? -1) - (rankOf(a.kind, a.outcome) ?? -1))) {
    if (seen.has(e.ref)) continue;
    seen.add(e.ref);
    const r = rankOf(e.kind, e.outcome);
    if (r !== null && r > bestBefore(e.ref) && bestBefore(e.ref) >= 0 && e.outcome && e.outcome !== "none") stuck.push(`Level up on ${mockTitle(e.ref)}: ${levelLabel(e.outcome)}`);
  }
  return { labs: labs.size, mocks: new Set(mocksW.map((e) => `${e.ref}:${e.at}`)).size, dsaSolved: dsa.size, explains: explains.length, stuck: stuck.slice(0, 5) };
}

export const dayLabel = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
export const rangeLabel = (now: number) => `${dayLabel(now - (DIGEST_DAYS - 1) * DAY)} – ${dayLabel(now)}`;

/** The facts the paragraph is written from: numbers, topic names, level words, next-step titles. */
export function factsText(f: DigestFacts): string {
  const d = f.did;
  if (!f.withOutcomes) return [`Week: ${f.range}`, `Did: ${d.lessons} lessons completed`, `Next steps, in order: ${f.next.map((n, i) => `${i + 1}. ${n.label}`).join("; ") || "none"}`].join("\n");
  return [
    `Week: ${f.range}`,
    `Did: ${d.lessons} lessons completed, ${d.labs} labs passed, ${d.mocks} mock interviews, ${d.dsaSolved} DSA problems solved, ${d.explains} explain-backs`,
    `Went well: ${f.stuck.length ? f.stuck.join("; ") : "nothing notable yet"}`,
    `Slipped (topics missed more than once): ${f.slipped.length ? f.slipped.slice(0, 2).map((s) => s.label).join("; ") : "none"}`,
    `Next steps, in order: ${f.next.length ? f.next.map((n, i) => `${i + 1}. ${n.label}`).join("; ") : "none"}`,
  ].join("\n");
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export type EmailParts = { facts: DigestFacts; paragraph: string | null; origin: string; unsubUrl: string; settingsUrl: string; brand: string; brandCell: string };

export function digestEmailHtml(p: EmailParts): string {
  const { facts: f, origin } = p;
  const abs = (h: string) => (h.startsWith("/") ? `${origin}${h}` : h);
  const utm = (h: string) => `${abs(h)}${h.includes("?") ? "&" : "?"}utm_source=weekly&utm_medium=email`;
  const cell = (n: number, label: string) => `<td align="center" style="padding:10px 4px;border:1px solid #3a3a40"><div style="font-size:24px;font-weight:bold;color:#f3f2ee">${n}</div><div style="font:11px monospace;letter-spacing:.06em;text-transform:uppercase;color:#a3a3a8">${label}</div></td>`;
  const h = (t: string) => `<p style="margin:26px 0 8px;font:12px monospace;letter-spacing:.12em;text-transform:uppercase;color:#ff6b2b">${t}</p>`;
  const li = (inner: string) => `<li style="margin:0 0 6px;font-size:15px;line-height:1.5;color:#c9c8c4">${inner}</li>`;
  const link = (label: string, href: string) => `<a href="${utm(href)}" style="color:#f3f2ee">${esc(label)}</a>`;
  const d = f.did;
  return `<!doctype html><html><body style="margin:0;background:#000;color:#f3f2ee;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;border:1px solid #3a3a40">
<tr><td style="padding:28px">
<p style="margin:0 0 18px;${p.brandCell}">${p.brand}</p>
<p style="margin:0 0 6px;font:12px monospace;letter-spacing:.12em;text-transform:uppercase;color:#ff6b2b">Your week · ${esc(f.range)}</p>
<h1 style="margin:0 0 14px;font-size:26px;line-height:1.2">Your weekly progress</h1>
${p.paragraph ? `<p style="margin:0 0 6px;font-size:16px;line-height:1.55;color:#c9c8c4">${esc(p.paragraph)}</p>` : ""}
${h("What you did")}
<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate"><tr>${cell(d.lessons, "lessons")}${cell(d.labs, "labs")}${cell(d.mocks, "mocks")}${cell(d.dsaSolved, "DSA solves")}</tr></table>
${f.stuck.length ? `${h("What stuck")}<ul style="margin:0;padding-left:20px">${f.stuck.map((s) => li(esc(s))).join("")}</ul>` : ""}
${f.slipped.length ? `${h("What slipped")}<p style="margin:0 0 8px;font-size:14px;color:#a3a3a8">Topics you missed more than once lately. A short recap usually fixes it.</p><ul style="margin:0;padding-left:20px">${f.slipped.map((s) => li(link(s.label, s.href))).join("")}</ul>` : ""}
${f.next.length ? `${h("Your next 3 steps")}<ol style="margin:0;padding-left:20px">${f.next.map((n) => li(`${link(n.label, n.href)}<span style="color:#7e7e85"> · ${esc(n.why)}</span>`)).join("")}</ol>` : ""}
<p style="margin:28px 0 0;font-size:12px;line-height:1.5;color:#7e7e85">You switched on the weekly email in your settings. <a href="${p.unsubUrl}" style="color:#a3a3a8">Unsubscribe</a> · <a href="${p.settingsUrl}" style="color:#a3a3a8">Email settings</a>. Built from your progress counts and topic names only.</p>
</td></tr></table></td></tr></table></body></html>`;
}
