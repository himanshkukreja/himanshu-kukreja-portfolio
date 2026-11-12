/**
 * The learner brief for the graded and tutoring features beyond the chats (AI audit 12 Nov 2026, O5, O9, O10): at most
 * six lines about this learner for the learner's turn (never the system prompt, which stays cached), each relevant to the
 * feature, plus a few "adapt" directives. Pure: built from the learner's memory notes (Layer 3: goals, level, how they
 * like answers, what they found hard) and the outcome log (Layer 1, ./events-model.ts: earlier attempts on this very
 * thing, misses that repeat, growth). The routes and the eval build the same text.
 *
 *   mock interviewer   the round's company and the bar they picked, their own target, the last attempt's weak phase and
 *                      what this phase missed then (to probe, never to name first)
 *   mock scorecard     earlier attempts at this mock, phase by phase, so the summary can say what moved
 *   lab hint           the Nth failed run, which hint levels this lab has already given
 *   lab review         the last review's rubric scores, the hints it took
 *   explain-back       earlier verdicts on this concept and the key points missed then
 *   lesson-qa, snip    level and how they like answers (the default style, O10), what they found hard, the graded
 *   design reviews     results that touch this topic
 *
 * Memory paused (or unavailable) means no brief: only what the request itself carries (the lab's failed-run count) may
 * be said. The compare* functions are O9's deterministic "compared with last time" lines the routes return beside a grade.
 */
// the .ts extension lets node --test load this file (the app's bundler resolves it too); tsc only allows it with a flag
// @ts-expect-error TS5097
import { dayOf, levelLabel, missOf, rankOf } from "./events-model.ts";
import type { EventCourse, OutcomeEvent, OutcomeKind } from "./events-model";

export type FeatureBriefId = "lesson-qa" | "snip-explain" | "lab-hint" | "lab-review" | "explain-back" | "mock-interviewer" | "mock-scorecard" | "lld-mock" | "lld-mock-scorecard" | "design-review" | "canvas-review";

/** Readable names for what the log holds as ids (the routes resolve them from the course's own content). */
export type Namer = {
  /** what an event was about: "explain-back on Consistent hashing", "mock M3 Payments (PayKaro)" */
  ref: (e: OutcomeEvent) => string | null;
  /** an id in an event's detail (a missed key point number, a signal id, a phase id) as its words */
  item: (e: OutcomeEvent, id: string) => string | null;
};
export const plainNamer: Namer = { ref: () => null, item: () => null };

export type BriefNotes = { goals: string[]; level: string; prefs: string[]; struggles: string[] };

export type FeatureBriefInput = {
  feature: FeatureBriefId;
  course: EventCourse;
  /** the memory's notes; null: memory paused or unavailable (no brief) */
  notes: BriefNotes | null;
  /** the learner's outcomes, newest first (empty while memory is off) */
  events: OutcomeEvent[];
  /** what this call is about: the log's kinds and ref (or ref prefix: a mock's phases), and words for topic matching */
  ref?: { kinds?: OutcomeKind[]; ref?: string; prefix?: string; topic?: string };
  names?: Namer;
  /** the mock round: its (fictional) company, the bar the learner picked, the current phase */
  mock?: { company: string; title: string; level?: string | null; phase?: { id: string; title: string } | null };
  /** a lab: failed runs so far (from the page), the hint level asked for now */
  lab?: { failedRuns?: number | null; level?: number | null };
  /** the learner picked an answer style themselves: no default-style line */
  styleChosen?: boolean;
  /** the route turns the default style into its own <answer_style> line (lesson-qa): the brief returns `style` and
   *  leaves the matching adapt lines out */
  styleLine?: boolean;
  now?: number;
};

/** the same cap and block shape as DSA Mastery's brief (./brief-model.ts; not imported, so this module has no runtime imports but the log's model) */
const BRIEF_MAX_LINES = 6;
const learnerTurnBlock = (lines: string[], adapt: string[]) =>
  [lines.length ? `<learner>\n${lines.join("\n")}\n</learner>` : "", adapt.length ? `<adapt>\n${adapt.map((a) => `- ${a}`).join("\n")}\n</adapt>` : ""].filter(Boolean).join("\n");

const ANSWERING: FeatureBriefId[] = ["lesson-qa", "snip-explain", "lab-hint", "design-review", "canvas-review"];
const DAY = 86_400_000;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const words = (s: string) => new Set((s.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []).map((w) => w.slice(0, 6)));
const near = (a: string, b: string) => {
  const x = words(a);
  for (const w of words(b)) if (x.has(w)) return true;
  return false;
};
/** a course phrase in quotes, at most ~80 characters, cut at a word end */
const quote = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (t.length <= 80) return `"${t}"`;
  const cut = t.slice(0, 79);
  return `"${cut.slice(0, Math.max(cut.lastIndexOf(" "), 50)).replace(/[\s,;:(]+$/, "")}…"`;
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** The events about this call's ref (exact ref, or every ref under a prefix), newest first. */
export function refEvents(events: OutcomeEvent[], ref: FeatureBriefInput["ref"]): OutcomeEvent[] {
  if (!ref || (!ref.ref && !ref.prefix)) return [];
  return events.filter((e) => (!ref.kinds || ref.kinds.includes(e.kind)) && (ref.ref ? e.ref === ref.ref : e.ref.startsWith(ref.prefix!)));
}

/** Items missed in two or more of these events (the newest first), with how often. */
function repeatedMisses(evs: OutcomeEvent[], names: Namer): { id: string; n: number; text: string }[] {
  const n = new Map<string, { n: number; e: OutcomeEvent }>();
  for (const e of evs) for (const id of new Set(missOf(e))) n.set(`${e.ref}|${id}`, { n: (n.get(`${e.ref}|${id}`)?.n ?? 0) + 1, e });
  return [...n.entries()]
    .filter(([, v]) => v.n >= 2)
    .map(([k, v]) => ({ id: k.split("|")[1], n: v.n, text: names.item(v.e, k.split("|")[1]) ?? "" }))
    .filter((x) => x.text);
}

const missedText = (e: OutcomeEvent, names: Namer, max = 3) =>
  missOf(e)
    .slice(0, max)
    .map((id) => names.item(e, id))
    .filter((x): x is string => !!x)
    .map(quote);

/** One run of a mock: its overall row and its phases (rows written together share detail.run). */
function mockRuns(evs: OutcomeEvent[]): { overall: OutcomeEvent; phases: OutcomeEvent[] }[] {
  const runs: { overall: OutcomeEvent; phases: OutcomeEvent[] }[] = [];
  for (const e of evs) if (e.kind === "mock_overall" || e.kind === "lld_mock") runs.push({ overall: e, phases: evs.filter((p) => p.kind === "mock_phase" && p.detail.run === e.detail.run && p.detail.run !== undefined) });
  return runs;
}

/** "P2 Capacity (junior)": a run's weakest answered phase. */
function weakest(run: { overall: OutcomeEvent; phases: OutcomeEvent[] }, names: Namer): { id: string; title: string; level: string; ev: OutcomeEvent | null } | null {
  const fromRows = run.phases.map((p) => ({ id: p.ref.split("/").pop() ?? "", level: p.outcome ?? "", ev: p as OutcomeEvent | null }));
  const levels = run.overall.detail.phases;
  const fromDetail = !fromRows.length && levels && typeof levels === "object" && !Array.isArray(levels) ? Object.entries(levels).map(([id, l]) => ({ id, level: String(l), ev: null })) : [];
  const all = [...fromRows, ...fromDetail].filter((x) => x.level && x.level !== "none");
  if (!all.length) return null;
  all.sort((a, b) => (rankOf("mock_phase", a.level) ?? 0) - (rankOf("mock_phase", b.level) ?? 0));
  const w = all[0];
  return { ...w, title: names.item(run.overall, w.id) ?? w.id };
}

/* ------------------------------------------------------------------ the lines */

export function featureBriefLines(i: FeatureBriefInput): string[] {
  const names = i.names ?? plainNamer;
  const now = i.now ?? Date.now();
  const lines: string[] = [];
  const n = i.notes;
  // memory off: only what the page itself sent (a lab's failed runs is progress, not a note)
  if (!n) {
    if (i.feature === "lab-hint" && i.lab?.failedRuns) lines.push(`This is failed run ${i.lab.failedRuns} on this lab.`);
    return lines;
  }
  const mine = refEvents(i.events, i.ref);

  // 1. who they are
  const goalLine = n.goals.length ? `goal: ${n.goals.slice(0, i.feature.startsWith("mock") || i.feature.startsWith("lld") ? 2 : 1).map((g) => clip(g, 90)).join("; ")}` : "";
  const who = [n.level ? `Level, in their words: ${clip(n.level, 110)}` : "", goalLine].filter(Boolean).join("; ");
  if (who) lines.push(`${who.charAt(0).toUpperCase()}${who.slice(1)}.`);
  if (n.prefs.length && ANSWERING.includes(i.feature)) lines.push(`Likes answers: ${n.prefs.slice(0, 3).map((p) => clip(p, 60)).join("; ")}.`);

  // 2. this call's own history
  switch (i.feature) {
    case "mock-interviewer":
    case "lld-mock": {
      if (i.mock) lines.push(`This round: ${i.mock.title} at ${i.mock.company} (fictional)${i.mock.level ? `, at the ${levelLabel(i.mock.level)} bar they picked` : ""}.`);
      const last = mockRuns(mine)[0];
      if (last) {
        const w = weakest(last, names);
        lines.push(`Last attempt at this mock (${dayOf(last.overall.at)}): overall ${levelLabel(last.overall.outcome)}${w ? `; weakest phase ${w.title} (${levelLabel(w.level)})` : ""}.`);
        const here = i.mock?.phase ? (last.phases.find((p) => p.ref.endsWith(`/${i.mock!.phase!.id}`)) ?? (last.overall.kind === "lld_mock" ? last.overall : null)) : null;
        const missed = here ? missOf(here).filter((id) => here.kind === "mock_phase" || id.startsWith(`${i.mock!.phase!.id}.`)) : [];
        const said = here ? missed.slice(0, 3).map((id) => names.item(here, id)).filter((x): x is string => !!x).map(quote) : [];
        if (said.length) lines.push(`In this phase last time they missed: ${said.join("; ")}.`);
      }
      break;
    }
    case "mock-scorecard":
    case "lld-mock-scorecard": {
      const runs = mockRuns(mine).slice(0, 2);
      for (const r of runs) {
        const per = r.phases.length
          ? r.phases
              .slice()
              .sort((a, b) => a.ref.localeCompare(b.ref))
              .map((p) => `${names.item(r.overall, p.ref.split("/").pop() ?? "") ?? p.ref.split("/").pop()} ${levelLabel(p.outcome)}`)
          : Object.entries((r.overall.detail.phases as Record<string, string> | undefined) ?? {}).map(([id, l]) => `${names.item(r.overall, id) ?? id} ${levelLabel(String(l))}`);
        lines.push(`Earlier attempt (${dayOf(r.overall.at)}): overall ${levelLabel(r.overall.outcome)}${per.length ? `; ${per.join(", ")}` : ""}.`);
      }
      const rep = repeatedMisses(mine, names);
      if (rep.length) lines.push(`Missed in more than one attempt: ${rep.slice(0, 3).map((r) => quote(r.text)).join("; ")}.`);
      break;
    }
    case "explain-back": {
      const prev = mine.filter((e) => e.kind === "explain_back").slice(0, 3);
      if (prev.length) lines.push(`Earlier attempts at explaining this: ${prev.map((e) => `${dayOf(e.at)} ${e.outcome ?? "?"}${missedText(e, names, 2).length ? ` (missed ${missedText(e, names, 2).join("; ")})` : ""}`).join(" | ")}.`);
      break;
    }
    case "lab-hint": {
      const hints = mine.filter((e) => e.kind === "lab_hint" && now - e.at < DAY);
      const fails = i.lab?.failedRuns ?? null;
      const shown = [...new Set(hints.map((h) => Number(h.detail.level) || 0).filter(Boolean))].sort();
      lines.push([fails ? `This is failed run ${fails} on this lab` : "", shown.length ? `hint level${shown.length > 1 ? "s" : ""} ${shown.join(", ")} already shown for it today (${plural(hints.length, "hint")})` : "no hint shown for it yet today"].filter(Boolean).join("; ") + ".");
      const passed = mine.find((e) => e.kind === "lab_pass");
      if (passed) lines.push(`They passed this lab before (${dayOf(passed.at)}): this is a re-run or a later stage.`);
      break;
    }
    case "lab-review": {
      const prev = mine.find((e) => e.kind === "lab_review");
      if (prev) lines.push(`Their last review of this lab (${dayOf(prev.at)}): ${prev.outcome}; correctness ${prev.detail.c}/5, complexity ${prev.detail.x}/5, edge cases ${prev.detail.e}/5, readability ${prev.detail.r}/5.`);
      const hints = mine.filter((e) => e.kind === "lab_hint");
      if (hints.length) lines.push(`Before passing they took ${plural(hints.length, "hint")} (up to level ${Math.max(...hints.map((h) => Number(h.detail.level) || 1))}).`);
      break;
    }
    default:
      break;
  }

  // 3. what they found hard: about this topic first; then misses that repeat across their graded work
  const topic = i.ref?.topic ?? "";
  const hard = [...n.struggles].sort((a, b) => Number(!!topic && near(b, topic)) - Number(!!topic && near(a, topic)));
  const rep = i.feature.includes("scorecard") ? [] : repeatedMisses(i.events.filter((e) => now - e.at < 30 * DAY), names);
  const hardBits = [...hard.slice(0, topic ? 3 : 2).map((s) => clip(s, 90)), ...rep.slice(0, 2).map((r) => `${quote(r.text)} (missed ${r.n} times)`)];
  if (hardBits.length) lines.push(`Found hard: ${hardBits.slice(0, 4).join("; ")}.`);

  // 4. for the answering features: their graded results that touch this topic (else the latest two)
  if (ANSWERING.includes(i.feature) && i.feature !== "lab-hint") {
    const graded = i.events.filter((e) => e.kind !== "lab_hint" && e.kind !== "lab_pass" && e.kind !== "mock_phase" && e.kind !== "dsa_submit" && e.kind !== "chat_quiz");
    // the newest result per thing graded
    const named = graded
      .filter((e, k) => graded.findIndex((x) => x.kind === e.kind && x.ref === e.ref) === k)
      .map((e) => ({ e, name: names.ref(e) }))
      .filter((x): x is { e: OutcomeEvent; name: string } => !!x.name);
    const about = topic ? named.filter((x) => near(x.name, topic)) : [];
    const pick = (about.length ? about : named).slice(0, 2);
    if (pick.length)
      lines.push(
        `${about.length ? "Graded work on this topic" : "Latest graded work"}: ${pick
          .map(({ e, name }) => {
            const miss = missedText(e, names, 2);
            const w = e.kind === "mock_overall" ? weakest({ overall: e, phases: i.events.filter((p) => p.kind === "mock_phase" && p.detail.run === e.detail.run) }, names) : null;
            return `${name} ${dayOf(e.at)}: ${levelLabel(e.outcome)}${w ? `, weakest ${w.title}` : ""}${miss.length ? `, missed ${miss.join("; ")}` : ""}`;
          })
          .join(" | ")}.`,
      );
  }

  // 5. growth on this very thing (first graded attempt to the latest)
  const ranked = mine.filter((e) => ["explain_back", "mock_overall", "lld_mock", "lab_review"].includes(e.kind) && rankOf(e.kind, e.outcome) !== null);
  if (ranked.length >= 2 && !i.feature.includes("scorecard")) {
    const [last, first] = [ranked[0], ranked[ranked.length - 1]];
    const d = (rankOf(last.kind, last.outcome) ?? 0) - (rankOf(first.kind, first.outcome) ?? 0);
    lines.push(`Growth here: ${levelLabel(first.outcome)} (${dayOf(first.at)}) → ${levelLabel(last.outcome)} (${dayOf(last.at)}), ${d > 0 ? "improving" : d < 0 ? "slipping" : "flat"} over ${plural(ranked.length, "attempt")}.`);
  }
  return lines.slice(0, BRIEF_MAX_LINES);
}

/* ------------------------------------------------------------------ adapt: how to fit this answer (O10, O9) */

const BEGINNER = /\b(beginner|new to (coding|programming|system design|distributed|backend|this)|fresher|student|no experience|just started|first job)\b/i;
const EXPERIENCED = /\b([5-9]|1\d)\+? ?(years?|yrs?)\b|\b(senior|staff|principal|lead|architect)\b/i;

/** The default answer style from memory (O10): the line a route adds when the learner picked no style themselves. */
export function defaultStyleLines(notes: BriefNotes | null): string[] {
  if (!notes) return [];
  const out: string[] = [];
  const prefs = notes.prefs.join(" ").toLowerCase();
  if (/hinglish|hindi/.test(prefs)) out.push("They like answers in Hinglish: answer in natural Hinglish (Roman script), technical terms in English.");
  if (BEGINNER.test(notes.level)) out.push("For a beginner: plain words, an everyday analogy first, define each technical term in a few words, one idea at a time.");
  else if (EXPERIENCED.test(notes.level) && !/analog/.test(prefs)) out.push("For an experienced engineer: terse and exact, no analogy, no basics; go straight to the trade-off.");
  else if (/analog/.test(prefs)) out.push("They like an everyday analogy first, then the technical words.");
  if (/\b(brief|short|concise|crisp)\b/.test(prefs)) out.push("They like short answers: keep it brief.");
  else if (/\b(detail(ed|s)?|depth|in-depth|thorough)\b/.test(prefs)) out.push("They like depth: include the why and one trade-off.");
  if (/\b(examples?|real[- ](world|apps?)|indian apps?)\b/.test(prefs)) out.push("They like concrete examples: use one from a real product.");
  else if (/\bcode first|code-first|show (me )?code\b/.test(prefs)) out.push("They like code first: lead with a short sketch, then one line of why.");
  return out;
}

/** The answer style (lib/ai/answerStyle.ts ids) memory points to when the learner picked none (O10): Hinglish when they
 *  like it, "simple" for a beginner, "detailed" for one who likes depth; null otherwise (the default tutor style). */
export function defaultAnswerStyle(notes: BriefNotes | null): "hinglish" | "simple" | "detailed" | null {
  if (!notes) return null;
  const prefs = notes.prefs.join(" ").toLowerCase();
  if (/hinglish|hindi/.test(prefs)) return "hinglish";
  if (BEGINNER.test(notes.level)) return "simple";
  if (/\b(detail(ed|s)?|depth|in-depth|thorough)\b/.test(prefs) && !EXPERIENCED.test(notes.level)) return "detailed";
  return null;
}

export function featureAdaptLines(i: FeatureBriefInput): string[] {
  const n = i.notes;
  if (!n) return [];
  const out: string[] = [];
  const mine = refEvents(i.events, i.ref);
  const topic = i.ref?.topic ?? "";
  if (ANSWERING.includes(i.feature) && !i.styleChosen) {
    const viaLine = i.styleLine ? defaultAnswerStyle(n) : null;
    // the route's <answer_style> line says it (Simple: plain words, analogy first, short): only what it doesn't cover here
    out.push(...defaultStyleLines(n).filter((l) => !viaLine || (viaLine === "hinglish" ? !/Hinglish/.test(l) : !/^For a beginner|short answers|like depth/.test(l))).slice(0, 2));
  }
  // what they found hard, for the reviews (their designs touch many topics)
  if ((i.feature === "design-review" || i.feature === "canvas-review") && n.struggles.length) out.push(`Where the design touches something they found hard (${n.struggles.slice(0, 2).map((x) => clip(x, 60)).join("; ")}), make that point concrete: show the one-line working.`);
  const hard = topic ? n.struggles.find((s) => near(s, topic)) : undefined;
  if (hard && ANSWERING.includes(i.feature)) out.push(`They found this hard before (${clip(hard, 70)}): go one step slower on exactly that point.`);
  switch (i.feature) {
    case "mock-interviewer":
    case "lld-mock":
      if (mockRuns(mine).length) out.push("If they skip a point listed as missed in this phase last time, probe it with one neutral question (\"what about the busiest hour?\"): never say their answer is wrong, never hint at the right one, never mention the earlier attempt.");
      if (i.mock?.level) out.push(`Pitch follow-ups at the ${levelLabel(i.mock.level)} bar they picked.`);
      break;
    case "mock-scorecard":
    case "lld-mock-scorecard":
      // the comparison itself is the route's (compareMock); asking the model to compare made it think past its token cap
      if (mockRuns(mine).length) out.push("Grade only this attempt: an earlier one never changes a level, and the site compares the attempts itself. In NEXT, prefer a gap that was also missed earlier.");
      break;
    case "explain-back":
      if (mine.some((e) => e.kind === "explain_back")) out.push("Grade only this explanation. If it misses a point it missed before, add \"(again)\" after it in MISSING; if it now has one it missed before, say so in GOT.");
      break;
    case "lab-review":
      // the comparison is the route's (compareLabReview): asked to compare, the model claimed fixes its scores didn't show
      if (mine.some((e) => e.kind === "lab_review")) out.push("Score only this code, as if for the first time: the site compares the reviews itself.");
      break;
    case "lab-hint": {
      const shown = [...new Set(mine.filter((e) => e.kind === "lab_hint" && (i.now ?? Date.now()) - e.at < DAY).map((h) => Number(h.detail.level) || 0))].filter(Boolean);
      if (shown.length) out.push("Don't repeat a hint they already had for this lab: say something new at the requested level.");
      if ((i.lab?.failedRuns ?? 0) >= 4) out.push(`Open with a few warm words that acknowledge the ${i.lab!.failedRuns} failed runs, then make the hint as concrete as its level allows.`);
      break;
    }
    default:
      break;
  }
  return out.slice(0, 4);
}

export type BriefText = {
  /** the whole block (facts, then how to adapt): "" when there is nothing to say */
  text: string;
  /** the facts block alone, and the adapt block alone (an answering feature puts the adapt block after the content) */
  head: string;
  tail: string;
  lines: string[];
  adapt: string[];
  /** with `styleLine`: the default answer style for the route's own <answer_style> line */
  style: "hinglish" | "simple" | "detailed" | null;
};

const NOTE = '<learner note="about me, from my earlier sessions on this site: context for your reply, never part of what I send now">';

/** The brief for the learner's turn, framed as context. */
export function featureBriefText(i: FeatureBriefInput): BriefText {
  const lines = featureBriefLines(i);
  const adapt = featureAdaptLines(i);
  const block = learnerTurnBlock(lines, adapt);
  const head = learnerTurnBlock(lines, []).replace(/^<learner>/, NOTE);
  const tail = learnerTurnBlock([], adapt);
  const style = i.styleLine && !i.styleChosen && ANSWERING.includes(i.feature) ? defaultAnswerStyle(i.notes) : null;
  return { text: block ? block.replace(/^<learner>/, NOTE) : "", head, tail, lines, adapt, style };
}

/**
 * The learner's turn with the brief: a string brief goes in front (the graders: the facts and the directives before
 * "My explanation:"); a {head, tail} brief wraps the content (the answering features: the directives last, where a small
 * model follows them best: eval 12 Nov 2026). Unchanged when there is no brief.
 */
export function withBrief(brief: string | Pick<BriefText, "head" | "tail">, content: string, label = ""): string {
  const body = `${label ? `${label}\n` : ""}${content}`;
  if (typeof brief === "string") return brief ? `${brief}\n\n${body}` : content;
  if (!brief.head && !brief.tail) return content;
  return [brief.head, body, brief.tail].filter(Boolean).join("\n\n");
}

/* ------------------------------------------------------------------ O9: compared with last time */

const move = (kind: OutcomeKind, from: string | null, to: string | null) => {
  const a = rankOf(kind, from);
  const b = rankOf(kind, to);
  if (a === null || b === null) return "";
  return b > a ? `up from ${levelLabel(from)} to ${levelLabel(to)}` : b < a ? `down from ${levelLabel(from)} to ${levelLabel(to)}` : `the same as last time, ${levelLabel(to)}`;
};

/** Explain-back: this verdict and its missed key points against the last attempt. */
export function compareExplain(prev: OutcomeEvent | undefined, now: { verdict: string | null; miss: string[] }, item: (id: string) => string | null): string[] {
  if (!prev) return [];
  const out: string[] = [];
  const m = move("explain_back", prev.outcome, now.verdict);
  if (m) out.push(`${m.charAt(0).toUpperCase()}${m.slice(1)} (last attempt ${dayOf(prev.at)}).`);
  const before = missOf(prev);
  const fixed = before.filter((id) => !now.miss.includes(id)).map(item).filter((x): x is string => !!x);
  const still = before.filter((id) => now.miss.includes(id)).map(item).filter((x): x is string => !!x);
  if (fixed.length && now.verdict) out.push(`Covered now: ${fixed.slice(0, 2).map(quote).join("; ")}.`);
  if (still.length) out.push(`Still missing: ${still.slice(0, 2).map(quote).join("; ")}.`);
  return out;
}

/** A mock scorecard: the overall level, the phases that moved, and the gaps still open since the last attempt. */
export function compareMock(
  prev: { overall: OutcomeEvent; phases: OutcomeEvent[] } | undefined,
  now: { overall: string; phases: { id: string; title: string; level: string; miss: string[]; met: string[] }[] },
  item: (id: string) => string | null,
): string[] {
  if (!prev) return [];
  const kind = prev.overall.kind;
  const out: string[] = [];
  const m = move(kind, prev.overall.outcome, now.overall);
  if (m) out.push(`Overall: ${m} (last attempt ${dayOf(prev.overall.at)}).`);
  const prevLevels = new Map<string, string>(prev.phases.map((p) => [p.ref.split("/").pop() ?? "", p.outcome ?? ""]));
  const pd = prev.overall.detail.phases;
  if (!prevLevels.size && pd && typeof pd === "object" && !Array.isArray(pd)) for (const [id, l] of Object.entries(pd)) prevLevels.set(id, String(l));
  const moved = now.phases
    .map((p) => ({ p, d: (rankOf("mock_phase", p.level) ?? 0) - (rankOf("mock_phase", prevLevels.get(p.id) ?? null) ?? 0), from: prevLevels.get(p.id) }))
    .filter((x) => x.from && x.d !== 0 && x.p.level);
  const ups = moved.filter((x) => x.d > 0).map((x) => `${x.p.title} (${levelLabel(x.from!)} → ${levelLabel(x.p.level)})`);
  const downs = moved.filter((x) => x.d < 0).map((x) => `${x.p.title} (${levelLabel(x.from!)} → ${levelLabel(x.p.level)})`);
  if (ups.length) out.push(`Up on ${ups.slice(0, 3).join(", ")}.`);
  if (downs.length) out.push(`Down on ${downs.slice(0, 2).join(", ")}.`);
  const prevMiss = new Set([...prev.phases.flatMap(missOf), ...(kind === "lld_mock" ? missOf(prev.overall) : [])]);
  const nowMiss = new Set(now.phases.flatMap((p) => p.miss));
  const nowMet = new Set(now.phases.flatMap((p) => p.met));
  const still = [...prevMiss].filter((id) => nowMiss.has(id)).map(item).filter((x): x is string => !!x);
  const fixed = [...prevMiss].filter((id) => nowMet.has(id)).map(item).filter((x): x is string => !!x);
  if (fixed.length) out.push(`Fixed since then: ${fixed.slice(0, 2).map(quote).join("; ")}.`);
  if (still.length) out.push(`Still missing: ${still.slice(0, 3).map(quote).join("; ")}.`);
  if (!ups.length && !downs.length && !fixed.length && !still.length && m.startsWith("the same")) out.push("Every phase at the same level as last time.");
  return out.slice(0, 4);
}

const AREAS: [string, string][] = [
  ["c", "correctness"],
  ["x", "complexity"],
  ["e", "edge cases"],
  ["r", "readability"],
];
/** A lab review: rubric scores against the last review of the same lab. */
export function compareLabReview(prev: OutcomeEvent | undefined, now: Record<"c" | "x" | "e" | "r", number>): string[] {
  if (!prev) return [];
  const ch = AREAS.map(([k, label]) => ({ label, a: Number(prev.detail[k]) || 0, b: now[k as "c"] })).filter((x) => x.a && x.a !== x.b);
  if (!ch.length) return [`The same scores as your last review (${dayOf(prev.at)}).`];
  const up = ch.filter((x) => x.b > x.a).map((x) => `${x.label} ${x.a} → ${x.b}`);
  const down = ch.filter((x) => x.b < x.a).map((x) => `${x.label} ${x.a} → ${x.b}`);
  return [`Since your last review (${dayOf(prev.at)}): ${[up.length ? `up on ${up.join(", ")}` : "", down.length ? `down on ${down.join(", ")}` : ""].filter(Boolean).join("; ")}.`];
}

export { mockRuns };

/* ------------------------------------------------------------------ the course chat's view of the log */

/**
 * The outcome log as lines for the course chat (its learner context and get_progress), newest first: explain-backs
 * with the key points missed, mock rounds with their phase levels and missed signals, labs (hints taken, the pass, the
 * review's scores), war rooms, papers and the chat's own quick checks. Names come from the course content; nothing
 * here is the learner's own words. DSA submits stay with the DSA digest.
 */
export function outcomeDigest(events: OutcomeEvent[], names: Namer, max = 10): string[] {
  const out: string[] = [];
  const seenLab = new Set<string>();
  const sdm = events.filter((e) => e.kind !== "dsa_submit" && e.kind !== "mock_phase");
  for (const e of sdm) {
    if (out.length >= max) break;
    const name = names.ref(e);
    const day = dayOf(e.at);
    if (e.kind === "explain_back") {
      const miss = missedText(e, names, 3);
      out.push(`${name ?? `explain-back on ${e.ref}`} (${day}): ${e.outcome}${miss.length ? `; key points missed: ${miss.join("; ")}` : e.outcome === "solid" ? "; every key point there" : ""}`);
    } else if (e.kind === "mock_overall" || e.kind === "lld_mock") {
      const phases = events.filter((p) => p.kind === "mock_phase" && p.detail.run === e.detail.run);
      const lv = phases.length
        ? phases.sort((a, b) => a.ref.localeCompare(b.ref)).map((p) => `${names.item(e, p.ref.split("/").pop() ?? "") ?? p.ref} ${levelLabel(p.outcome)}`)
        : Object.entries((e.detail.phases as Record<string, string> | undefined) ?? {}).map(([id, l]) => `${names.item(e, id) ?? id} ${levelLabel(String(l))}`);
      const missIds = [...phases.flatMap((p) => missOf(p).map((id) => ({ p, id }))), ...(e.kind === "lld_mock" ? missOf(e).map((id) => ({ p: e, id })) : [])];
      const miss = missIds
        .slice(0, 4)
        .map(({ p, id }) => names.item(p, id))
        .filter((x): x is string => !!x)
        .map(quote);
      const cl = typeof e.detail.cl === "number" && typeof e.detail.of === "number" ? `; interview checklist ${e.detail.cl} of ${e.detail.of}` : "";
      out.push(`${name ?? `mock ${e.ref}`} AI scorecard (${day}): overall ${levelLabel(e.outcome)}${typeof e.detail.target === "string" ? ` (picked the ${levelLabel(e.detail.target)} bar)` : ""}${lv.length ? `; ${lv.join(", ")}` : ""}${cl}${miss.length ? `; missed: ${miss.join("; ")}` : ""}`);
    } else if (e.kind.startsWith("lab_")) {
      if (seenLab.has(e.ref)) continue;
      seenLab.add(e.ref);
      const all = events.filter((x) => x.ref === e.ref && x.kind.startsWith("lab_"));
      const hints = all.filter((x) => x.kind === "lab_hint");
      const pass = all.find((x) => x.kind === "lab_pass");
      const rev = all.find((x) => x.kind === "lab_review");
      const bits = [
        hints.length ? `${plural(hints.length, "hint")} (up to level ${Math.max(...hints.map((h) => Number(h.detail.level) || 1))})${typeof hints[0].detail.fails === "number" ? `, ${plural(Number(hints[0].detail.fails), "failed run")} by the last hint` : ""}` : "",
        pass ? `passed ${dayOf(pass.at)}` : "not passed yet",
        rev ? `review ${rev.outcome}: correctness ${rev.detail.c}/5, complexity ${rev.detail.x}/5, edge cases ${rev.detail.e}/5, readability ${rev.detail.r}/5` : "",
      ].filter(Boolean);
      out.push(`${name ?? `lab ${e.ref}`} (${day}): ${bits.join("; ")}`);
    } else if (e.kind === "war_room") {
      const miss = missOf(e);
      out.push(`${name ?? `war room ${e.ref}`} (${day}): run graded ${e.outcome}, ${e.detail.first ?? "?"} of ${e.detail.calls ?? "?"} calls right first time${miss.length ? ` (wrong first: call ${miss.join(", ")})` : ""}`);
    } else if (e.kind === "paper") {
      const miss = missOf(e);
      out.push(`${name ?? `paper ${e.ref}`} (${day}): ${e.outcome}${miss.length ? `; marking points not fully met: ${miss.join(", ")}` : ""}`);
    } else if (e.kind === "chat_quiz") {
      if (seenLab.has("chat_quiz")) continue;
      seenLab.add("chat_quiz");
      const qs = events.filter((x) => x.kind === "chat_quiz" && e.at - x.at < 14 * DAY);
      const right = qs.filter((x) => x.outcome === "right").length;
      const wrong = qs.filter((x) => x.outcome === "wrong").length;
      out.push(`Practice questions in the chat (last 2 weeks): ${right} right, ${wrong} wrong${qs.length - right - wrong ? `, ${qs.length - right - wrong} written answers` : ""}`);
    }
  }
  return out;
}
