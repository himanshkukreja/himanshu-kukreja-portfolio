/**
 * The learner brief (the AI audit's §7 `learnerBrief`): at most six short lines about one learner that a tutor adds to
 * the learner's turn (never the system prompt, so the system prompts stay cached), so its answer fits them. Pure: built
 * from the profile (./dsa-profile.ts, Layer 2: their records), the shared memory's notes (lib/ai/chat/memory-model.ts
 * dsaNotes, Layer 3: what the tutors noted in earlier chats) and what the page sends (the language and view the learner
 * picked on this device). The route and the eval build the same text.
 *
 * Memory switched off: no notes and nothing from their records, only the language and level the learner set themselves.
 */
import type { DsaNotes } from "@/lib/ai/chat/memory-model";
import { DSA_LANG_LABEL } from "@/lib/dsa/types";
import type { DsaClientSignals, DsaExp, DsaProfile } from "./dsa-profile";

export const BRIEF_MAX_LINES = 6;

const LEVEL_WORDS: Record<DsaExp, string> = {
  new: "a beginner (new to DSA, maybe to coding)",
  some: "has some DSA practice",
  experienced: "experienced (comfortable with most patterns)",
};
const FROM_WORDS: Record<NonNullable<DsaProfile["levelFrom"]>, string> = {
  "show-everything": 'turned on "Show everything"',
  welcome: "their welcome answer",
  onboarding: "their onboarding answer",
  record: "their record",
};

/** DSA modules and the System Design Mastery idea that uses the same structure (the one cross-course link). */
const SDM_BRIDGE: Record<string, string> = {
  "m3-hashing": "hash maps are the core of caches and consistent hashing",
  "m5-sliding-window": "rate limiting counts requests in a sliding window",
  "m8-binary-search": "bisecting a bad deploy is the first-true search",
  "s1-linked-lists": "an LRU cache is a hash map plus a doubly linked list",
  "s2-stacks": "undo stacks and call stacks in services",
  "s3-queues-and-deques": "message queues and back-pressure are queues at scale",
  "s4-trees-and-bst": "database indexes are search trees (B-trees)",
  "s5-heaps": "top-K leaderboards and job schedulers run on heaps",
};

export type BriefRef = {
  /** the problem the message is about (the tutor's problem, or the page's) */
  problem?: { id: string; title: string; concept: string; conceptTitle: string; module: string };
  /** that problem's record */
  facts?: { fails: number; solved: boolean; revealed: boolean } | null;
  /** a concept page */
  concept?: { title: string; module: string };
};

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
const near = (a: string, b: string) => {
  const x = words(a);
  for (const w of words(b)) if (x.has(w)) return true;
  return false;
};

export function dsaBriefLines(o: {
  feature: "dsa-chat" | "dsa-tutor";
  profile: DsaProfile | null;
  notes: DsaNotes | null;
  client: DsaClientSignals | null;
  ref?: BriefRef;
  /** the course chat's studied topics (System Design Mastery), for the cross-course link */
  sdmStudied?: string[];
}): string[] {
  const { profile: p, notes: n, client: c, ref } = o;
  const lines: string[] = [];

  // 1. who: level, language, goal, how they like answers
  const level = p?.level ?? (c?.full ? "experienced" : (c?.exp ?? null));
  const from = p?.levelFrom ?? (c?.full ? "show-everything" : c?.exp ? "welcome" : null);
  const lang = c?.lang ?? p?.lang ?? null;
  const who = [
    level ? `Level: ${LEVEL_WORDS[level]}${from ? ` (from ${FROM_WORDS[from]})` : ""}${n?.level ? `; in their words: ${clip(n.level, 100)}` : ""}` : n?.level ? `Level, in their words: ${clip(n.level, 100)}` : "",
    lang ? `codes in ${DSA_LANG_LABEL[lang]}` : "",
    p?.goal ? `goal: ${p.goal}` : n?.goals.length ? `goal: ${clip(n.goals[0], 80)}` : "",
  ].filter(Boolean);
  if (who.length) {
    const w = who.join("; ");
    lines.push(`${w.charAt(0).toUpperCase()}${w.slice(1)}.`);
  }
  if (n?.prefs.length) lines.push(`Likes answers: ${n.prefs.slice(0, 4).join("; ")}.`);

  // 2. their record, and the habits it shows
  if (p) {
    const rec = [`${p.solved} problem${p.solved === 1 ? "" : "s"} solved of ${p.attempted} attempted`, `${p.lessonsDone} lesson${p.lessonsDone === 1 ? "" : "s"} finished`];
    const habit = p.editorialFirst.of >= 3 && p.editorialFirst.n >= 2 ? ` Habit: revealed the editorial before solving on ${p.editorialFirst.n} of their last ${p.editorialFirst.of} problems.` : "";
    const pat = p.patterns.length ? ` Failed submits often: ${p.patterns.join("; ")}.` : "";
    lines.push(`Record: ${rec.join(", ")}.${habit}${pat}`);
  }

  // 3. this problem (the chat on a problem's page; the tutor gets its attempts beside the code)
  if (o.feature === "dsa-chat" && ref?.problem && ref.facts && (ref.facts.fails || ref.facts.solved || ref.facts.revealed))
    lines.push(`On "${ref.problem.title}": ${ref.facts.solved ? "solved" : "not solved yet"}${ref.facts.fails ? `, ${ref.facts.fails} failed submit${ref.facts.fails === 1 ? "" : "s"}` : ""}${ref.facts.revealed ? ", editorial revealed before solving" : ""}.`);

  // 4. what they found hard: the ones about this topic first, at most three
  const topic = ref?.problem ? `${ref.problem.conceptTitle} ${ref.problem.title}` : (ref?.concept?.title ?? "");
  const hard = [...(p?.struggles ?? []).map((s) => ({ t: `${s.concept} (${s.why})`, k: s.concept })), ...(n?.struggles ?? []).map((s) => ({ t: s, k: s }))];
  hard.sort((a, b) => Number(topic && near(b.k, topic)) - Number(topic && near(a.k, topic)));
  if (hard.length) lines.push(`Found hard: ${hard.slice(0, 3).map((h) => clip(h.t, 110)).join("; ")}.`);

  // 5. recurring mistakes
  if (n?.mistakes.length) lines.push(`Recurring mistakes: ${n.mistakes.slice(0, 3).map((m) => clip(m, 110)).join("; ")}.`);

  // 6. where they left off
  if (n?.sessions.length) lines.push(`Last DSA session${n.sessions.length > 1 ? "s" : ""}: ${n.sessions.slice(0, 2).map((s) => `${s.at}: ${clip(s.summary, 200)}`).join(" | ")}`);

  // 7. one cross-course link, for a learner who also studies System Design Mastery
  const mod = ref?.problem?.module ?? ref?.concept?.module;
  if (mod && SDM_BRIDGE[mod] && o.sdmStudied?.length) lines.push(`Also studies System Design Mastery (${o.sdmStudied.slice(0, 3).join(", ")}): ${SDM_BRIDGE[mod]}; link the two in a clause when it helps.`);

  return lines.slice(0, BRIEF_MAX_LINES);
}

export function briefBlock(lines: string[]): string {
  return lines.length ? `<learner>\n${lines.join("\n")}\n</learner>` : "";
}

/**
 * How to adapt this answer, as short directives (a small model follows a concrete line in the turn far better than a
 * general rule in the system prompt; eval 12 Nov 2026). Derived from the same profile and notes as the brief; at most 5, the answer-shape ones last.
 */
export function dsaAdaptLines(o: { feature: "dsa-chat" | "dsa-tutor"; profile: DsaProfile | null; notes: DsaNotes | null; client: DsaClientSignals | null; ref?: BriefRef }): string[] {
  const { profile: p, notes: n, client: c, ref } = o;
  const out: string[] = [];
  const level = p?.level ?? (c?.full ? "experienced" : (c?.exp ?? null));
  const prefs = (n?.prefs ?? []).join(" ").toLowerCase();
  const beginnerWords = /\b(new to (coding|programming|dsa)|beginner|first (dsa|coding|programming))\b/i.test(n?.level ?? "");
  if (level === "new" || beginnerWords)
    out.push("For a beginner: open with an everyday analogy, define each technical word in a few plain words, one idea only, short sentences, at most about 120 words; a hint is the smallest useful step, with the question easy to answer.");
  else if (level === "experienced") out.push("For an experienced learner: terse and exact, no analogy, no basics; at most about 110 words (a hint: one or two sentences).");
  if (p && p.editorialFirst.of >= 3 && p.editorialFirst.n >= 2)
    out.push("If they ask for the editorial, the solution or the approach: give none of it; say warmly that they've opened editorials early lately and a ten-minute try or one more hint is what makes the pattern stick (and keeps the full Bits), give one concrete starting nudge as a question, and say they can still reveal it from the Editorial tab.");
  const topic = ref?.problem ? `${ref.problem.conceptTitle} ${ref.problem.title}` : (ref?.concept?.title ?? "");
  const hard = [...(p?.struggles ?? []).map((s) => s.concept), ...(n?.struggles ?? [])].find((s) => topic && near(s, topic));
  if (hard) out.push(`They found this topic hard before (${clip(hard, 80)}): go one step slower on exactly that point: a smaller step than usual (never more of the answer), checked with one easy question.`);
  if (n?.mistakes.length && o.feature === "dsa-tutor") out.push("If their code shows one of their recurring mistakes, name the link in a clause (\"the same slip as before\") and give a one-line rule of thumb to catch it.");
  if (/\b(brief|short|concise)\b/.test(prefs) && level !== "experienced") out.push("They like brief answers: keep it short.");
  if (/code first|code-first/.test(prefs)) out.push(`They like code first: lead with a short general sketch${(c?.lang ?? p?.lang) ? ` in ${DSA_LANG_LABEL[(c?.lang ?? p?.lang)!]}` : ""}, then one line of why.`);
  else if (/intuition|analog/.test(prefs) && level !== "new" && !beginnerWords) out.push("They like the intuition first: an everyday picture before the technical words.");
  return out.slice(0, 5);
}

/** The learner's turn's block: the brief (facts) and the adapt lines (directives). */
export function learnerTurnBlock(lines: string[], adapt: string[]): string {
  return [briefBlock(lines), adapt.length ? `<adapt>\n${adapt.map((a) => `- ${a}`).join("\n")}\n</adapt>` : ""].filter(Boolean).join("\n");
}
