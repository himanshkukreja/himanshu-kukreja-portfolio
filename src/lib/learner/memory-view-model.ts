/**
 * The memory page's view of the outcome log (You -> Tutor memory, v2, 12 Nov 2026; AI audit O14). Pure, so the route
 * and the tests share it.
 *
 *   outcomeKindLabel, outcomeSrc   how a row reads in the "Graded results" list and where it came from
 *   knownFromResults               what the AI features take from those results (the feature brief's "found hard":
 *                                  lib/learner/feature-brief-model.ts), as items for "What the AI knows", each with
 *                                  its provenance (explain-back, mock, lab, war room, paper), its date and the ids of
 *                                  the rows behind it: forgetting the item deletes those rows, so it is really gone.
 */

export type OutcomeKindAny = "explain_back" | "mock_phase" | "mock_overall" | "lld_mock" | "lab_run" | "lab_hint" | "lab_pass" | "lab_review" | "war_room" | "paper" | "chat_quiz" | "dsa_submit";

/** One row as the page gets it: the log's fields, the row id, and readable names the server resolved from the content. */
export type ViewRow = {
  id: number;
  course: "sdm" | "dsa";
  kind: OutcomeKindAny;
  ref: string;
  outcome: string | null;
  detail: Record<string, unknown>;
  at: number;
  /** what was graded, in words ("Consistent hashing", "M1 BillBolt Autopay", "LRU cache") */
  name: string;
  /** a mock phase's title ("Capacity estimates") */
  part?: string | null;
};

export type KnownSrc = "chat" | "dsa" | "you" | "onboarding" | "feedback" | "mock" | "lab" | "explain-back" | "war-room" | "paper" | "chat-quiz";
export type KnownItem = { key: string; text: string; src: KnownSrc; at: number; course: "sdm" | "dsa"; ids: number[] };

export const SRC_LABEL: Record<KnownSrc, string> = {
  chat: "course chat",
  dsa: "DSA chat or tutor",
  you: "set or edited by you",
  onboarding: "your goal chat",
  feedback: "from your feedback on answers",
  mock: "mock",
  lab: "lab",
  "explain-back": "explain-back",
  "war-room": "war room",
  paper: "paper",
  "chat-quiz": "chat quiz",
};

const KIND_LABEL: Record<OutcomeKindAny, string> = {
  explain_back: "Explain-back",
  mock_phase: "Mock phase",
  mock_overall: "Mock round",
  lld_mock: "LLD mock",
  lab_run: "Lab run",
  lab_hint: "Lab hint",
  lab_pass: "Lab pass",
  lab_review: "Lab review",
  war_room: "War room",
  paper: "Paper",
  chat_quiz: "Chat quiz",
  dsa_submit: "DSA submit",
};
export const outcomeKindLabel = (k: string) => KIND_LABEL[k as OutcomeKindAny] ?? k.replace(/_/g, " ");

export function outcomeSrc(k: string): KnownSrc {
  if (k === "explain_back") return "explain-back";
  if (k.startsWith("mock_") || k === "lld_mock") return "mock";
  if (k.startsWith("lab_")) return "lab";
  if (k === "war_room") return "war-room";
  if (k === "paper") return "paper";
  return "chat-quiz";
}

const LEVEL: Record<string, string> = { none: "not answered", "below-junior": "below Junior", junior: "Junior", sde: "SDE", senior: "Senior", staff: "Staff", "hint-1": "hint 1", "hint-2": "hint 2", "hint-3": "hint 3" };
/** A row's verdict or level in words. */
export const outcomeWords = (o: string | null) => (!o ? "" : (LEVEL[o] ?? o.replace(/-/g, " ")));

const weakLevel = (l: string | null) => l === "below-junior" || l === "junior";
const DAY = 86_400_000;

/**
 * What the AI features take from the learner's graded results, as "found hard" items (newest first, at most `max`):
 *   explain-back   a concept whose latest verdict was partial or a misconception (the rows: every grade of it)
 *   mock           a phase at Junior or below in the latest round of a mock (the rows: that phase in every round);
 *                  an LLD round at Junior or below overall
 *   lab            a lab that took two or more hints, or whose review found issues (its hint and review rows)
 *   war room       a run graded shaky or rough
 *   paper          an answer under 60% of its marks
 * Only the last 120 days count (the brief reads no further back).
 */
export function knownFromResults(rows: ViewRow[], now: number, max = 8): KnownItem[] {
  const recent = rows.filter((r) => now - r.at <= 120 * DAY).sort((a, b) => b.at - a.at);
  const out: KnownItem[] = [];
  const seen = new Set<string>();
  const add = (k: string, it: Omit<KnownItem, "key">) => {
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ key: k, ...it });
  };
  for (const r of recent) {
    if (r.kind === "explain_back") {
      const all = recent.filter((x) => x.kind === "explain_back" && x.ref === r.ref);
      if (all[0] !== r || (r.outcome !== "partial" && r.outcome !== "misconception")) continue;
      add(`explain|${r.ref}`, { text: `${r.name}: ${r.outcome === "misconception" ? "a misconception" : "partly explained"} at the last explain-back${all.length > 1 ? ` (${all.length} tries)` : ""}`, src: "explain-back", at: r.at, course: r.course, ids: all.map((x) => x.id) });
    } else if (r.kind === "mock_overall") {
      if (seen.has(`mock|${r.ref}`)) continue;
      seen.add(`mock|${r.ref}`);
      const phases = recent.filter((p) => p.kind === "mock_phase" && p.detail.run !== undefined && p.detail.run === r.detail.run && weakLevel(p.outcome));
      for (const p of phases.sort((a, b) => a.ref.localeCompare(b.ref)).slice(0, 3)) {
        const every = recent.filter((x) => x.kind === "mock_phase" && x.ref === p.ref);
        add(`phase|${p.ref}`, { text: `${p.part || p.ref.split("/").pop()} in ${r.name}: ${outcomeWords(p.outcome)} in the latest round`, src: "mock", at: p.at, course: p.course, ids: every.map((x) => x.id) });
      }
    } else if (r.kind === "lld_mock") {
      const all = recent.filter((x) => x.kind === "lld_mock" && x.ref === r.ref);
      if (all[0] !== r || !weakLevel(r.outcome)) continue;
      add(`lld|${r.ref}`, { text: `${r.name}: ${outcomeWords(r.outcome)} overall in the latest LLD round`, src: "mock", at: r.at, course: r.course, ids: [r.id] });
    } else if (r.kind === "lab_hint" || r.kind === "lab_review") {
      if (seen.has(`lab|${r.ref}`)) continue;
      const all = recent.filter((x) => x.ref === r.ref && (x.kind === "lab_hint" || x.kind === "lab_review"));
      const hints = all.filter((x) => x.kind === "lab_hint");
      const review = all.find((x) => x.kind === "lab_review");
      const top = Math.max(0, ...hints.map((h) => Number(h.detail.level) || Number(String(h.outcome).replace(/\D/g, "")) || 1));
      const bits = [hints.length >= 2 ? `${hints.length} hints (up to hint ${top})` : "", review?.outcome === "issues" ? "the code review found issues" : ""].filter(Boolean);
      if (!bits.length) continue;
      add(`lab|${r.ref}`, { text: `${r.name} lab: ${bits.join("; ")}`, src: "lab", at: r.at, course: r.course, ids: all.map((x) => x.id) });
    } else if (r.kind === "war_room") {
      const all = recent.filter((x) => x.kind === "war_room" && x.ref === r.ref);
      if (all[0] !== r || (r.outcome !== "shaky" && r.outcome !== "rough")) continue;
      add(`war|${r.ref}`, { text: `${r.name}: the run was graded ${r.outcome}`, src: "war-room", at: r.at, course: r.course, ids: [r.id] });
    } else if (r.kind === "paper") {
      const m = String(r.outcome ?? "").match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
      if (!m || Number(m[2]) <= 0 || Number(m[1]) / Number(m[2]) >= 0.6) continue;
      add(`paper|${r.ref}`, { text: `${r.name}: ${r.outcome} marks`, src: "paper", at: r.at, course: r.course, ids: [r.id] });
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

/**
 * What a delete on the memory page asks for: `{ all: true }`, or `{ ids }` (positive whole numbers, no repeats, at most
 * 500). null: nothing usable (the route answers 400). Only ever applied to the caller's own rows (route + RLS).
 */
export function deleteRequest(body: unknown): { all: true } | { ids: number[] } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { ids?: unknown; all?: unknown };
  if (b.all === true) return { all: true };
  if (!Array.isArray(b.ids)) return null;
  const ids = [...new Set(b.ids.map((x) => (typeof x === "number" || (typeof x === "string" && /^\d+$/.test(x)) ? Number(x) : NaN)).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 500);
  return ids.length ? { ids } : null;
}
