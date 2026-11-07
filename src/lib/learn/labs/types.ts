/**
 * Code labs: "implement this component" exercises (a rate limiter, an LRU cache, an outbox relay…)
 * that run in the browser against visible and hidden tests: Python with Pyodide, JavaScript and
 * TypeScript in a sandboxed worker. Authored as markdown in the content repo
 * (resources/labs/<id>.md, format v2 in resources/labs/README.md).
 *
 * Format v2 is a superset of v1: a v1 file (Python only, one set of tests) parses to the same lab it
 * always did. v2 adds languages, stages (build-a-system projects), incident labs, interview
 * follow-ups, a run visualiser, chaos tests and scale tests.
 */

export type LabDifficulty = "easy" | "medium" | "hard";

/** What the reader writes in. JavaScript and TypeScript share one test family ("js"). */
export type LabLang = "python" | "javascript" | "typescript";
export type LabFamily = "py" | "js";
export const LAB_LANGS: LabLang[] = ["python", "javascript", "typescript"];
export const familyOf = (l: LabLang): LabFamily => (l === "python" ? "py" : "js");
export const LANG_LABEL: Record<LabLang, string> = { python: "Python", javascript: "JavaScript", typescript: "TypeScript" };
export const LANG_SHORT: Record<LabLang, string> = { python: "Python", javascript: "JS", typescript: "TS" };
export const LANG_FILE: Record<LabLang, string> = { python: "solution.py", javascript: "solution.js", typescript: "solution.ts" };

/** lab: implement a component · project: a staged build (Mini-Redis) · incident: fix the code behind an outage */
export type LabType = "lab" | "project" | "incident";
export const LAB_TYPES: LabType[] = ["lab", "project", "incident"];
export const TYPE_LABEL: Record<LabType, string> = { lab: "Lab", project: "Project", incident: "Incident" };

/** A lesson the lab practises, as written in the lab file: a course code + section anchor. */
export type LabLessonRef = { ref: string; anchor?: string; label?: string };

export type LabHint = { title: string; md: string };

/** Support or test code in one family. `ts`: written in TypeScript (transpiled before it runs). */
export type LabSrc = { code: string; ts: boolean };

/** The test-side code of one family (Python, or JavaScript/TypeScript). */
export type FamilyCode = {
  given: LabSrc | null;
  visible: LabSrc | null;
  hidden: LabSrc | null;
  /** incident labs: the tests that reproduce the outage (fail on the broken code, pass on the fix) */
  repro: LabSrc | null;
  chaos: LabSrc | null;
  scale: LabSrc | null;
};

/** The reader-facing code of one language. */
export type LangCode = { starter: string; solution: string };

export type StageSource = {
  title: string;
  brief: string;
  hints: LabHint[];
  /** per language: code appended to the reader's code when the stage unlocks, and the stage's reference solution */
  lang: Partial<Record<LabLang, { delta: string; solution: string }>>;
  family: Partial<Record<LabFamily, { visible: LabSrc | null; hidden: LabSrc | null }>>;
};

export type FollowUpSource = {
  title: string;
  /** what the interviewer asks (markdown) */
  prompt: string;
  /** what a strong answer covers (markdown; shown after the reader answers) */
  answer: string;
  /** extra tests the reader's code must pass for this follow-up (optional, per family) */
  tests: Partial<Record<LabFamily, LabSrc>>;
  /** a reference solution that passes the base tests and these (per language; the checker runs it, readers never see it) */
  solution: Partial<Record<LabLang, string>>;
};

// ------------------------------------------------------------------------------------ visualiser

export type VizTone = "signal" | "ok" | "bad" | "link" | "muted" | "fg";
export type VizView = "timeline" | "ring" | "state" | "list";
export type VizSeries = { label: string; event: string; where?: Record<string, string | number | boolean | null>; value?: string; tone?: VizTone };
export type VizSpec =
  | { view: "timeline"; title?: string; test?: string; x: string; bucket: number; style: "bars" | "lines"; series: VizSeries[]; xLabel?: string; yLabel?: string }
  | { view: "ring"; title?: string; test?: string; space: number; events: { node: string; remove: string; key: string } }
  | { view: "state"; title?: string; test?: string; event: string; note?: string; states: { id: string; label?: string; tone?: VizTone }[] }
  | { view: "list"; title?: string; test?: string; event: string; kind: "list" | "queue" | "map"; head?: string; tail?: string };
export const VIZ_VIEWS: VizView[] = ["timeline", "ring", "state", "list"];

/** One `viz.emit(type, ...)` call, as the harness reports it. */
export type VizEvent = { type: string; data: Record<string, unknown> };

// ------------------------------------------------------------------------------------ chaos + scale

export type ChaosScenario = "interleave" | "crash" | "retry" | "duplicate" | "partition";
export const CHAOS_SCENARIOS: ChaosScenario[] = ["interleave", "crash", "retry", "duplicate", "partition"];
export const CHAOS_LABEL: Record<ChaosScenario, string> = { interleave: "interleavings", crash: "crashes", retry: "lost replies + retries", duplicate: "duplicate deliveries", partition: "network partitions" };
export type ChaosSpec = { scenarios: ChaosScenario[]; runs: number };

export type Complexity = "O(1)" | "O(log n)" | "O(n)" | "O(n log n)" | "O(n^2)";
export const COMPLEXITIES: Complexity[] = ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n^2)"];
export type ScaleSpec = { sizes: number[]; target: Complexity; budgetSec: number; label?: string };

// ------------------------------------------------------------------------------------ the parsed file

/** One parsed lab file (markdown and code, nothing rendered yet). Plain data: safe in Node. */
export type LabSource = {
  id: string;
  title: string;
  topic: string;
  type: LabType;
  /** course week number the lab belongs to (its world) */
  week: number;
  order: number;
  difficulty: LabDifficulty;
  minutes: number;
  /** interview mode's target time */
  interviewMinutes: number;
  xp: number;
  /** per-run time limit, seconds */
  timeoutSec: number;
  summary: string;
  lessons: LabLessonRef[];
  /** learning paths this lab belongs to (ids, see PATHS) */
  paths: string[];
  brief: string;
  hints: LabHint[];
  solutionNotes: string;
  /** languages the reader can pick, in LAB_LANGS order (each has a starter and a solution) */
  languages: LabLang[];
  code: Partial<Record<LabLang, LangCode>>;
  family: Partial<Record<LabFamily, FamilyCode>>;
  stages: StageSource[];
  followUps: FollowUpSource[];
  incident: { report: string; story: string } | null;
  viz: VizSpec | null;
  chaos: ChaosSpec | null;
  scale: ScaleSpec | null;
  // v1 shape, Python only ("" when the lab has no Python): what older tooling (the AI eval) reads
  given: string;
  starter: string;
  solution: string;
  visible: string;
  hidden: string;
  /** hash of the file: autosaved code from another version gets a "starter changed" note */
  version: string;
};

/** A lesson link, resolved against the course map. */
export type LabLesson = { code: string; title: string; href: string; label: string | null };

export type LabTestCounts = { visible: number; hidden: number };

export type LabSummary = {
  id: string;
  title: string;
  topic: string;
  type: LabType;
  week: number;
  /** "01" */
  weekCode: string;
  /** the world's key ("week-01-data-at-scale") when the course has that week */
  weekKey: string | null;
  worldTitle: string;
  order: number;
  difficulty: LabDifficulty;
  minutes: number;
  interviewMinutes: number;
  xp: number;
  summary: string;
  href: string;
  lessons: LabLesson[];
  languages: LabLang[];
  paths: string[];
  /** the default language's test counts (all stages for a project) */
  tests: LabTestCounts;
  features: { stages: number; followUps: number; viz: VizView | null; chaos: boolean; scale: boolean };
  version: string;
};

/** Everything one language needs in the lab room. */
export type LabLangView = {
  lang: LabLang;
  starter: string;
  solution: string;
  solutionHtml: string;
  given: LabSrc | null;
  givenHtml: string;
  visible: LabSrc | null;
  visibleTestsHtml: string;
  hidden: LabSrc | null;
  repro: LabSrc | null;
  reproHtml: string;
  chaos: LabSrc | null;
  scale: LabSrc | null;
  tests: LabTestCounts & { repro: number };
  stages: { delta: string; solution: string; visible: LabSrc | null; hidden: LabSrc | null; visibleTestsHtml: string; tests: LabTestCounts }[];
  followUps: { tests: LabSrc | null; count: number }[];
};

/** Everything the lab room needs (markdown rendered to HTML on the server). */
export type Lab = LabSummary & {
  briefHtml: string;
  hints: { title: string; html: string }[];
  solutionNotesHtml: string;
  timeoutSec: number;
  langs: Partial<Record<LabLang, LabLangView>>;
  stages: { title: string; briefHtml: string; hints: { title: string; html: string }[] }[];
  followUps: { title: string; promptHtml: string; answerHtml: string }[];
  incident: { reportHtml: string; storyHtml: string } | null;
  viz: VizSpec | null;
  chaos: ChaosSpec | null;
  scale: ScaleSpec | null;
};

/** What a lesson's "Try it in code" card shows. */
export type LessonLabLink = Pick<LabSummary, "id" | "title" | "topic" | "summary" | "href" | "difficulty" | "minutes" | "xp" | "tests" | "languages" | "type">;

export const LAB_XP: Record<LabDifficulty, number> = { easy: 60, medium: 90, hard: 120 };

/** Progress / XP key for a lab (GameProvider.awardOnce). */
export const labKey = (id: string) => `lab:${id}`;
/** An interview-mode pass (badge on the index; synced with the game state). */
export const labInterviewKey = (id: string) => `lab-iv:${id}`;
export const INTERVIEW_PASS_XP = 30;
/** Score an interview run needs to count as a pass (and earn the badge). */
export const INTERVIEW_PASS_SCORE = 70;

export const labHref = (id: string) => `/labs/${id}`;

export const DIFFICULTY_LABEL: Record<LabDifficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** Learning paths: a lab joins one with `paths: [<id>]` in its front matter. Unknown ids show humanised. */
export const PATHS: { id: string; title: string; blurb: string }[] = [
  { id: "rate-limiting", title: "Rate limiting", blurb: "From one bucket to fair multi-tenant admission." },
  { id: "reliability", title: "Reliability under failure", blurb: "Retries, breakers, idempotency and exactly-once effects." },
  { id: "caching", title: "Caching", blurb: "Eviction, scope and invalidation." },
  { id: "distributed-data", title: "Distributed data", blurb: "Partitioning, replication and conflicts." },
  { id: "messaging", title: "Messaging and delivery", blurb: "Outboxes, dedupe and at-least-once done right." },
  { id: "search-analytics", title: "Search and analytics", blurb: "Top-k, sketches and counting at scale." },
  { id: "ai-systems", title: "AI systems", blurb: "Context packing and semantic caches." },
  { id: "operations", title: "Operations", blurb: "SLOs, alerts and the incidents that teach them." },
];
export const pathTitle = (id: string) => PATHS.find((p) => p.id === id)?.title ?? id.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
