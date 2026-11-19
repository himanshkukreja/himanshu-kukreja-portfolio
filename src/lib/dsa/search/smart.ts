/**
 * The smart layer's shared parts (pure, import-light): the compact taxonomy the model is shown, the strict JSON it
 * must answer with, the checks that keep only ids that exist, and the step from its answer to filters and ranking on the
 * Practice page. The route (src/app/api/dsa/smart-search/route.ts) and the eval (scripts/dsa-search-eval.mjs) both use it.
 */
import { FACETS } from "../taxonomy";
import type { FilterRow, FilterState, GroupId } from "../problem-filters";
import { emptyState } from "../problem-filters";
import type { AskAnswer } from "./ask";

export const SMART_MODEL = "claude-haiku-4-5-20251001";

export type SmartFilters = { topics: string[]; tags: string[]; difficulty: ("easy" | "medium" | "hard")[]; domains: string[]; status?: "unsolved" | "solved" };
export type SmartAnswer = { filters: SmartFilters; keywords: string[]; learnFirst?: string; note: string };
/** what the route returns: the answer plus the lesson's title and page when learnFirst is one we can open */
export type SmartResponse = SmartAnswer & { learn?: { id: string; title: string; href: string }; /** the written answer and its links, for a question */ ask?: AskAnswer; cached?: boolean; left?: number | null };

/** What the model may pick from. Built from the page's data once per revalidation. */
export type Taxonomy = {
  topics: { id: string; label: string; group: "structures" | "algorithms" | "patterns" }[];
  tags: string[];
  domains: { id: string; label: string }[];
  lessons: { id: string; title: string }[];
};

/** A written street, camp tent or set (src/lib/dsa/kinds.ts) as the model may name it: key is "<module>/<lesson>" (a lesson id alone repeats). */
export type LeanChoice = { key: string; title: string; kind: "street" | "camp-tent" | "set"; /** a company set's type id ("fintech") */ company?: string };

/** the id with its label when the label says more than the id ("service-mass-recruiter (Service mass recruiter)" stays; "fintech" alone) */
const withLabel = (d: { id: string; label: string }) => (d.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === d.id.replace(/-/g, " ") ? d.id : `${d.id} (${d.label})`);

export function buildTaxonomy(rows: FilterRow[], companies: { id: string; label: string }[], concepts: Record<string, string>, lessons: Record<string, string>, lean: LeanChoice[] = [], companyLabel: (id: string) => string = (id) => id): Taxonomy {
  const tags = new Set<string>();
  for (const r of rows) r.tags.forEach((t) => tags.add(t));
  const topics = (["patterns", "algorithms", "structures"] as const).flatMap((group) => FACETS[group].map((f) => ({ id: f.id, label: f.label, group })));
  // company types: the ones problems carry, plus those of company sets that have no problem written yet
  const domains = [...companies];
  for (const l of lean) if (l.company && !domains.some((d) => d.id === l.company)) domains.push({ id: l.company, label: companyLabel(l.company) });
  return { topics, tags: [...tags].sort(), domains, lessons: [...Object.keys(lessons).map((id) => ({ id, title: concepts[id] || id })), ...lean.map((l) => ({ id: l.key, title: l.title }))] };
}

/** The system prompt: the task, the taxonomy (ids only, so it stays small), the exact JSON, and a few examples. */
export function smartSystem(t: Taxonomy): string {
  return [
    "You turn a learner's request into filters for a problem bank of about 1,000 coding problems (data structures and algorithms). You never see the problems; you only pick from the lists below. Reply with ONE JSON object and nothing else.",
    "",
    '{"filters":{"topics":[],"tags":[],"difficulty":[],"domains":[],"status":null},"keywords":[],"learnFirst":null,"note":""}',
    "",
    "Rules:",
    "- topics: ids from TOPICS. Pick the technique and, when the request names one, the data structure (\"sliding window\" + \"string\"). 1 to 3 ids. [] when the request names no topic.",
    "- tags: ids from TAGS that fit more narrowly. 0 to 3.",
    '- difficulty: ONLY when the request itself uses a level word ("easy", "medium", "hard", "warm up" = easy, "challenging" = hard). Naming a problem or a topic is NOT a difficulty request: then [].',
    "- domains: ids from DOMAINS when the request names an industry (payments, maps, ads) or a kind of company or interview (\"fintech interview problems\" = [\"fintech\"], \"quant\", \"SaaS\", \"mass recruiter\", \"startup\", \"big tech\"): company-set problems are written for those types. Otherwise [].",
    '- status: "unsolved" or "solved" only when the request says so, else null.',
    '- keywords: 2 to 6 lower-case words or short phrases that would appear in a problem title or statement. For a famous problem (Two Sum, LRU Cache, Trapping Rain Water, Word Ladder) always include its LeetCode number as "lc N" and 2 to 3 descriptive words; the bank retells classics in its own scenarios, so describe the idea ("rain trapped between towers"), not only the name.',
    "- learnFirst: an id from LESSONS when the learner is asking to learn or understand a technique and a lesson teaches it, else null. LESSONS holds the course lessons, and the streets, camp tents and sets as <module>/<lesson> (\"co-fintech/warm-up-round\" is the Fintech set's warm-up round, \"core-150-gaps/...\" a gap set).",
    "- note: one short sentence, plain words, saying what you looked for. No payment talk.",
    "- Typos and shorthands are requests too: \"ll\" is linked list, \"pq\" is heap, \"dp\", \"bfs\", \"slidng windw\". Fix them and answer. Do not invent ids. Only a request that is clearly not about coding problems or learning them gets empty lists and a note saying so.",
    "",
    `TOPICS: ${t.topics.map((x) => x.id).join(", ")}`,
    `TAGS: ${t.tags.join(", ")}`,
    `DOMAINS: ${t.domains.map(withLabel).join(", ")}`,
    `LESSONS: ${t.lessons.map((l) => l.id).join(", ")}`,
  ].join("\n");
}

export const SMART_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["filters", "keywords", "learnFirst", "note"],
  properties: {
    filters: {
      type: "object",
      additionalProperties: false,
      required: ["topics", "tags", "difficulty", "domains", "status"],
      properties: {
        topics: { type: "array", items: { type: "string" } },
        tags: { type: "array", items: { type: "string" } },
        difficulty: { type: "array", items: { type: "string", enum: ["easy", "medium", "hard"] } },
        domains: { type: "array", items: { type: "string" } },
        status: { anyOf: [{ type: "string", enum: ["unsolved", "solved"] }, { type: "null" }] },
      },
    },
    keywords: { type: "array", items: { type: "string" } },
    learnFirst: { anyOf: [{ type: "string" }, { type: "null" }] },
    note: { type: "string" },
  },
} as const;

const list = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase()).filter(Boolean).slice(0, max) : []);

/** The model's text to an answer that only holds ids that exist; null when it is not JSON of the right shape. */
export function parseSmart(text: string, t: Taxonomy): SmartAnswer | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j: unknown;
  try {
    j = JSON.parse(m[0]);
  } catch {
    return null;
  }
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const f = (o.filters && typeof o.filters === "object" ? o.filters : {}) as Record<string, unknown>;
  const topicIds = new Set(t.topics.map((x) => x.id));
  const tagSet = new Set(t.tags);
  const domSet = new Set(t.domains.map((d) => d.id));
  const lessonSet = new Set(t.lessons.map((l) => l.id));
  const diff = list(f.difficulty, 3).filter((d): d is "easy" | "medium" | "hard" => d === "easy" || d === "medium" || d === "hard");
  const status = f.status === "unsolved" || f.status === "solved" ? f.status : undefined;
  const learn = typeof o.learnFirst === "string" && lessonSet.has(o.learnFirst.trim()) ? o.learnFirst.trim() : undefined;
  return {
    filters: { topics: list(f.topics, 4).filter((x) => topicIds.has(x)), tags: list(f.tags, 4).filter((x) => tagSet.has(x)), difficulty: [...new Set(diff)], domains: list(f.domains, 3).filter((x) => domSet.has(x)), ...(status ? { status } : {}) },
    keywords: list(o.keywords, 8).map((k) => k.slice(0, 40)),
    ...(learn ? { learnFirst: learn } : {}),
    note: typeof o.note === "string" ? o.note.trim().slice(0, 200) : "",
  };
}

/** the normalised key two identical questions share (cache key) */
export const smartKey = (q: string) => q.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

/* ------------------------------------------------------------------ from an answer to the page's filters */

const GROUP_OF = new Map<string, GroupId>(Object.entries(FACETS).flatMap(([g, fs]) => fs.map((f) => [f.id, g as GroupId] as const)));

/** The answer as filter selections (the chips the learner can edit): topics by their group, difficulty, domains, status. */
export function smartSelection(a: SmartAnswer): FilterState["sel"] {
  const sel = emptyState().sel;
  for (const id of a.filters.topics) {
    const g = GROUP_OF.get(id);
    if (g && !sel[g].includes(id)) sel[g].push(id);
  }
  sel.level = [...a.filters.difficulty];
  sel.company = [...a.filters.domains];
  if (a.filters.status === "unsolved") sel.status = ["todo", "tried"];
  else if (a.filters.status === "solved") sel.status = ["solved"];
  return sel;
}

/** the words that rank the filtered rows: the model's keywords and its narrow tags */
export const smartBoost = (a: SmartAnswer): string[] => [...a.keywords, ...a.filters.tags.map((t) => t.replace(/-/g, " "))];

/** The groups to let go of, in order, when the filters leave nothing: the narrowest promises first. */
export const RELAX_ORDER: GroupId[] = ["status", "company", "structures", "algorithms", "level", "patterns"];
