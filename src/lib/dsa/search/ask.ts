/**
 * The Practice box's answer layer (pure, import-light): which typed text is a question or a concept ask (it gets an AI
 * answer card above the results), what the model is told to add to the smart-search JSON for one, the check that keeps only
 * links that exist, and the card's state. The route (src/app/api/dsa/smart-search/route.ts), the hook and the page share it.
 * A plain search ("binary search", "two sum", "medium sliding window strings") is NOT a question: instant results, no call.
 */

export type AskLink = { kind: "lesson" | "problem"; title: string; href: string };
export type AskAnswer = { text: string; links: AskLink[] };

const STARTERS = /^(what|what's|whats|why|how|when|which|who|whose|explain|compare|define|describe|tell me|is|are|does|do|did|can|could|should|would|will|difference|diff)\b/i;
const CONCEPT = /\b(difference between|differences between|vs\.?|versus|compare|explain|intuition|why does|why do|why is|how does|how do|how to|what is|what are|what's|when to use|when should)\b/i;
const LIST_ASK = /\b(problems?|questions?|exercises?|practice|drills?)\b/i;
const EXPLAINS = /\b(difference|explain|vs|versus|compare|intuition)\b/i;
/** "show me", "give me", "find me": a request for problems, not for an explanation */
const IMPERATIVE = /^(show|give|find|list|get|i want|i need|i'd like|id like|recommend|suggest|pick)\b/i;

/** true for a question or a concept ask that deserves a written answer; false for a search or a request for problems */
export function isQuestion(raw: string): boolean {
  const t = raw.trim().replace(/\s+/g, " ");
  if (t.length < 8 || t.length > 200) return false;
  const words = t.split(" ").length;
  if (words < 3) return false;
  if (IMPERATIVE.test(t) && !CONCEPT.test(t)) return false;
  if (/\?\s*$/.test(t)) return true;
  if (CONCEPT.test(t) && !(LIST_ASK.test(t) && !EXPLAINS.test(t))) return true;
  if (STARTERS.test(t) && words >= 4 && !LIST_ASK.test(t)) return true;
  return false;
}

/** the part added to the smart system prompt when a question is asked: one call returns the filters and the answer */
export const ASK_RULES = [
  "",
  "ANSWER MODE. The learner asked a question, not only for problems. Besides the filters, write the answer, using ONLY the PASSAGES in the user's message (course lessons and problem statements, each tagged [s1], [s2]…).",
  '- Add two more keys to the JSON: "answer" (a string) and "sources" (an array of passage tags that best help the learner read on, 1 to 3, lessons first; a problem only when it directly practises the idea; e.g. ["s2","s1"]).',
  "- answer: 2 to 5 short plain sentences (under 90 words in all), no markdown, no bullet lists, no code blocks, no spoilers of a problem's solution. Answer the question asked first, concretely, as a good tutor speaks; do not retell a problem unless asked. If the passages do not cover it, answer briefly from standard computer science.",
  '- If the question is not about data structures, algorithms, coding interviews or this course, set "answer" to "" and "sources" to []. Never talk about payment or plans.',
  "- Still fill filters and keywords so the page can show the problems that fit the question (a concept question: the topic and its tags; a comparison: both topics).",
].join("\n");

export const ASK_SCHEMA_EXTRA = {
  answer: { type: "string" },
  sources: { type: "array", items: { type: "string" } },
} as const;

/** the model's answer and source tags to the card: links only to passages we showed, at most 3 */
export function parseAsk(text: string, passages: { tag: string; link: AskLink }[], fallback: AskLink[] = []): AskAnswer {
  const m = text.match(/\{[\s\S]*\}/);
  let o: Record<string, unknown> = {};
  try {
    o = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
  } catch {}
  const answer = typeof o.answer === "string" ? o.answer.replace(/\s*\[\[?s\d+\]?\]/g, "").replace(/\s+/g, " ").trim().slice(0, 900) : "";
  if (!answer) return { text: "", links: [] };
  const byTag = new Map(passages.map((p) => [p.tag, p.link]));
  const tags = Array.isArray(o.sources) ? o.sources.filter((x): x is string => typeof x === "string").map((x) => x.replace(/[^a-z0-9]/gi, "").toLowerCase()) : [];
  const links: AskLink[] = [];
  for (const t of tags) {
    const l = byTag.get(t);
    if (l && !links.some((x) => x.href.split("#")[0] === l.href.split("#")[0])) links.push(l);
    if (links.length >= 3) break;
  }
  if (!links.length) links.push(...fallback.slice(0, 2));
  // a lesson always comes first (the catalog's best concept when the model named none), then problems
  const lesson = fallback.find((l) => l.kind === "lesson");
  if (lesson && !links.some((l) => l.kind === "lesson")) links.unshift(lesson);
  links.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "lesson" ? -1 : 1));
  return { text: answer, links: links.slice(0, 3) };
}

export type CardState = "none" | "guest" | "loading" | "answer" | "empty" | "error";

/** which answer card the page shows for the typed text */
export function cardState(o: { text: string; signedIn: boolean; authLoading: boolean; busy: boolean; hasAnswer: boolean; answerText: string; failed: boolean }): CardState {
  if (!isQuestion(o.text)) return "none";
  if (o.authLoading) return "none";
  if (!o.signedIn) return "guest";
  if (o.hasAnswer) return o.answerText ? "answer" : "empty";
  if (o.failed && !o.busy) return "error";
  return "loading";
}

/** the chips under the box: a mix of searches and questions; three show at a time and rotate */
export const EXAMPLES = [
  "Two-pointer problems on strings",
  "What's the difference between BFS and DFS?",
  "Easy problems to start with heaps",
  "Medium sliding-window problems on strings",
  "When should I use a heap instead of sorting?",
  "Hard dynamic programming problems on grids",
  "Why does binary search need a sorted array?",
  "Graph problems asked at fintech companies",
] as const;

/** n examples starting at `from`, wrapping */
export function exampleWindow(from: number, n = 3): string[] {
  return Array.from({ length: n }, (_, i) => EXAMPLES[(from + i) % EXAMPLES.length]);
}
