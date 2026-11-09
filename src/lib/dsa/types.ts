/**
 * DSA Mastery data shapes shared by the server loaders (src/lib/dsa/load.ts) and the client (map, concept page,
 * problem room). Content comes from the dsa-mastery repo (README "Formats"); nothing here imports server code.
 */

export type DsaLang = "python" | "javascript" | "java" | "cpp";
export const DSA_LANGS: DsaLang[] = ["python", "javascript", "java", "cpp"];
export const DSA_LANG_LABEL: Record<DsaLang, string> = { python: "Python", javascript: "JavaScript", java: "Java", cpp: "C++" };
/** Languages judged in the browser (Pyodide and the JS worker); Java and C++ go to the judge (/api/dsa/judge). */
export const BROWSER_LANGS: ReadonlySet<DsaLang> = new Set<DsaLang>(["python", "javascript"]);

export type DsaLevel = "easy" | "medium" | "hard";

/** The plan's language-neutral signature (§7.1): `{ fn: busiest_start, params: [{ name, type }], returns }`. */
export type DsaSignature = { fn: string; params: { name: string; type: string }[]; returns: string };

export type DsaTestCase = { name: string; input: Record<string, unknown>; output: unknown; note?: string };

/** One row of the problem index (small: the hub, lists and links read it). */
export type ProblemSummary = {
  id: string;
  title: string;
  module: string;
  concept: string;
  line: string;
  level: DsaLevel;
  order: number;
  patterns: string[];
  minutes: number | null;
  classic: string[];
};

export type ConceptSummary = {
  id: string;
  module: string;
  order: number;
  title: string;
  status: "built" | "planned";
  summary: string;
  /** "structure": an Academy Part 2 structure lesson (resources/structures/, /dsa/structures/<id>); else a 6S concept */
  kind?: "concept" | "structure";
};

/* ------------------------------------------------------------------ worlds (resources/worlds/<id>.yml) */

export type WorldNodeType = "concept" | "practice" | "checkpoint" | "gate" | "side" | "service" | "boss";

export type WorldNode = {
  id: string;
  type: WorldNodeType;
  title: string;
  required: boolean;
  /** the page it opens, when built (concept page, problem room); null while planned */
  href: string | null;
  /** concept nodes: the concept id; practice nodes: the problem id */
  ref?: string;
  level?: DsaLevel;
  /** content exists (a built concept or problem); planned nodes show as "coming soon" */
  built: boolean;
  /** checkpoint: the quiz (<module>/<concept>), its two mixed problems, pass mark, when it appears */
  quiz?: string;
  problems?: { id: string; title: string; built: boolean }[];
  pass?: number;
  opensAt?: number;
  /** gate: the checkpoint that opens it */
  openedBy?: string;
  /** side path: game | bridge | playbook | challenge */
  kind?: string;
  badge?: string;
  /** the world's final stop: the building it stands in (Academy: Launch Hall) */
  building?: string;
};

export type WorldStretch = { id: string; title: string; nodes: WorldNode[] };

export type WorldRegion = {
  id: string;
  code: string;
  title: string;
  module: string;
  detail: "full" | "outline";
  status: string;
  intro: string | null;
  /** the Academy part the region belongs to ("part-2": core data structures), when the world has parts */
  part?: string;
  /** the region's home product line ("Kestrel Stream"), from its own lines or its module's (course.yml) */
  line: string | null;
  /** the module's one-sentence objective (course.yml), for regions without an intro yet */
  objective: string | null;
  stretches: WorldStretch[];
  side: WorldNode[];
  boss: WorldNode | null;
};

export type WorldSummary = { id: string; title: string; subtitle: string; order: number; audience: string; atLaunch: string; open: boolean };

export type WorldSpec = WorldSummary & {
  /** the Kestrel division the world is themed as ("Kestrel Academy"), "" when the spec has none */
  division: string;
  /** what each stop is called on this world's map (Academy: concept "room", practice "paving stone", ...) */
  theme: { map: string; road: string; stops: Partial<Record<WorldNodeType, string>> };
  regions: WorldRegion[];
  final: WorldNode | null;
};

/* ------------------------------------------------------------------ traces and races (generated/) */

export type TraceAsk = { var: string; prompt: string; answer: unknown; before?: unknown; choices: { value: unknown; correct: boolean; why: string }[] };

export type TraceFrame = {
  i: number;
  marker: number;
  note: string;
  state: Record<string, unknown>;
  view: { window?: [number, number] | null; pointers?: Record<string, number>; leaving?: number | null; joining?: number | null };
  ask: TraceAsk | null;
};

export type Trace = {
  id: string;
  title: string;
  view: string;
  template: string | null;
  input: Record<string, unknown>;
  vars: string[];
  frames: TraceFrame[];
  result?: unknown;
};

export type Race = { id: string; title: string; unit: string; sizes: number[]; series: { label: string; counts: number[]; tone: "bad" | "good" | string }[]; note: string };

/* ------------------------------------------------------------------ pages */

export type DsaStage = { id: string; label: string; title: string; minutes: number };

export type ConceptCheckpoint = { nodeId: string; key: string; pass: number; problems: { id: string; title: string; built: boolean }[] };

export type ConceptPage = {
  id: string;
  module: string;
  moduleTitle: string;
  regionTitle: string;
  title: string;
  summary: string;
  level: string;
  minutes: number;
  line: string;
  invariant: string;
  keyPoints: string[];
  html: string;
  stages: DsaStage[];
  toc: { id: string; text: string; level: 1 | 2 | 3 | 4; kind: "part" | "chapter" | "section" | "question" | "other"; stageId: string }[];
  readingMinutes: number;
  contentVersion: string;
  traces: Record<string, Trace>;
  races: Record<string, Race>;
  /** :::tabs blocks by id: the code per language (the reorder widget rebuilds a template from it) */
  templates: Record<string, Partial<Record<DsaLang, string>>>;
  reviewCards: { front: string; back: string }[];
  practice: ProblemSummary[];
  checkpoint: ConceptCheckpoint | null;
};

export type SdmLink = { href: string; title: string; kind: "lesson" | "lab" | "problem" };

export type ProblemPage = {
  id: string;
  title: string;
  level: DsaLevel;
  line: string;
  module: string;
  concept: string;
  conceptTitle: string;
  order: number;
  signature: DsaSignature;
  checker: string;
  limits: { timeMs: number; memoryMb: number };
  complexity: { time: string; space: string } | null;
  patterns: string[];
  classic: string[];
  minutes: number | null;
  /** section HTML: scenario, task, examples, constraints, scenario-to-model */
  sections: { id: string; title: string; html: string }[];
  hints: { title: string; html: string }[];
  visible: DsaTestCase[];
  hiddenCount: number;
  /** content hash of the tests (cache key for /api/dsa/tests/<id>?v=) */
  testsVersion: string;
  sdmLinks: SdmLink[];
  prev: ProblemSummary | null;
  next: ProblemSummary | null;
};

/* ------------------------------------------------------------------ XP (plan §4.5) */

export const DSA_XP = { concept: 60, stage: 10, easy: 20, medium: 40, hard: 80, checkpointQuiz: 10, trace: 5, gate: 50, boss: 200, world: 500, daily: 15 } as const;

export const problemXp = (level: DsaLevel) => DSA_XP[level] ?? DSA_XP.medium;

/** game_done keys (synced like every other quest; src/game/useGameSync.ts xpOfKey knows their XP) */
export const dsaKeys = {
  problem: (id: string) => `dsa:p:${id}`,
  concept: (id: string) => `dsa:c:${id}`,
  stage: (concept: string, stage: string) => `dsa:s:${concept}/${stage}`,
  checkpointQuiz: (nodeId: string) => `dsa:cpq:${nodeId}`,
  gate: (world: string, region: string, n: string | number) => `dsa:gate:${world}:${region}:${n}`,
};

/**
 * XP a DSA game_done key is worth, for merging a device's keys into the account (useGameSync mergeGame). A problem's
 * level isn't in its key, so a merge counts it as Medium; the solve itself awards the exact amount.
 */
export function dsaXpOfKey(key: string): number {
  if (key.startsWith("dsa:c:")) return DSA_XP.concept;
  if (key.startsWith("dsa:s:")) return DSA_XP.stage;
  if (key.startsWith("dsa:p:")) return DSA_XP.medium;
  if (key.startsWith("dsa:cpq:")) return DSA_XP.checkpointQuiz;
  if (key.startsWith("dsa:tr:")) return DSA_XP.trace;
  if (key.startsWith("dsa:gate:")) return DSA_XP.gate;
  if (key.startsWith("dsa:boss:")) return DSA_XP.boss;
  if (key.startsWith("dsa:world:")) return DSA_XP.world;
  if (key.startsWith("dsa:daily:")) return DSA_XP.daily;
  if (key.startsWith("dsa:lab:")) return DSA_XP.easy * 2; // a structure lesson's build-it lab
  return 0;
}

/** learning_progress rows for DSA (course_id 'dsa'): lessons are week=<module>, lesson_slug=<concept>; problems week='problems'. */
export const DSA_COURSE_ID = "dsa";
export const DSA_PROBLEMS_WEEK = "problems";
