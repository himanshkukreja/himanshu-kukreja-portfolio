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
  /* the filter fields below are absent from an older generated/problem-index.json: readers default them */
  /** tags.difficulty, 1 (gentlest) to 10 */
  rating?: number | null;
  /** "warm-up" | "practice" | "checkpoint" */
  role?: string;
  companyTypes?: string[];
  /** tags.structures / tags.algorithms as the author wrote them (src/lib/dsa/taxonomy.ts) */
  own?: { structures?: string[]; algorithms?: string[] };
  /** the first words of the statement, plain text, for the problems search */
  blurb?: string;
};

export type ConceptSummary = {
  id: string;
  module: string;
  order: number;
  title: string;
  status: "built" | "planned";
  summary: string;
  /** "structure": an Academy Part 2 structure lesson (resources/structures/, /dsa/structures/<id>); "algorithm": a Part 3
   * algorithm lesson (resources/algorithms/, /dsa/algorithms/<id>); else a 6S concept */
  kind?: "concept" | "structure" | "algorithm";
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
  /** checkpoint of a structure or algorithm lesson: its build-it lab (the lab.yml id, game key dsa:lab:<id>) */
  lab?: { id: string; title: string; href: string };
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

/** A stretch (Academy: a section; Interview practice: a street, one problem set). `planned` counts the street's problems not written yet. */
export type WorldStretch = { id: string; title: string; nodes: WorldNode[]; planned?: number };

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
  /** the region's home product line ("Music streaming app"), from its own lines or its module's (course.yml) */
  line: string | null;
  /** the module's one-sentence objective (course.yml), for regions without an intro yet */
  objective: string | null;
  /** the module's plain title ("Sliding Window", course.yml): what the map shows; the region title is its theme name */
  moduleTitle: string | null;
  /** the learner step number ("2.3": part, then place in the part), from the world order (steps.ts) */
  step?: string;
  stretches: WorldStretch[];
  side: WorldNode[];
  boss: WorldNode | null;
  /** Interview practice: when the district opens ("Opens at launch", "Opens with wave 3"), from its `opens` */
  opens?: string;
  /** Interview practice: the Academy lessons it practises (the region's `links`), by module; href is the first written lesson */
  links?: { module: string; label: string; href: string | null }[];
  /** Interview practice: problems planned for the district but not written yet (the built ones are its stops) */
  planned?: number;
};

export type WorldSummary = { id: string; title: string; subtitle: string; order: number; audience: string; atLaunch: string; open: boolean };

export type WorldSpec = WorldSummary & {
  /** the division id the world is themed as (internal, never shown), "" when the spec has none */
  division: string;
  /** what each stop is called on this world's map (Academy: concept "room", practice "paving stone", ...) */
  theme: { map: string; road: string; stops: Partial<Record<WorldNodeType, string>> };
  regions: WorldRegion[];
  /** the world's parts in order (Academy: 1 Toolkit, 2 Data structures, 3 Algorithms, 4 Patterns); the map groups
   * its buildings under them. Empty when the world has no parts. */
  parts: { id: string; title: string; label: string; summary: string; regions: string[] }[];
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

/** `own` is false for a lesson with no checkpoint of its own: nodeId is then its lesson stop on the map (lesson-stops.ts). */
export type ConceptCheckpoint = { nodeId: string; key: string; pass: number; problems: { id: string; title: string; built: boolean }[]; own?: boolean };

export type ConceptPage = {
  /** in-article clips (clips.json) by id, for the lesson's ::clip figures */
  clips?: Record<string, { id: string; caption: string; base: string | null; v: string; say: string[] }>;
  id: string;
  module: string;
  moduleTitle: string;
  regionTitle: string;
  title: string;
  summary: string;
  level: string;
  minutes: number;
  line: string;
  /** the line's plain label ("Music streaming app"), "" when it has none */
  lineLabel: string;
  invariant: string;
  keyPoints: string[];
  /** "In one picture": the lesson's pattern card (its title and rendered body), null when the lesson has none */
  picture: { title: string; html: string; more: string } | null;
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
  lineLabel: string;
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

/* ------------------------------------------------------------------ progress keys */

/**
 * game_done keys (synced like every other quest). They are DSA progress, worth DSA Mastery's own Bits
 * (src/lib/dsa/rewards.ts) and never SD Mastery XP (src/game/useGameSync.ts xpOfKey gives dsa:* keys 0).
 */
export const dsaKeys = {
  problem: (id: string) => `dsa:p:${id}`,
  concept: (id: string) => `dsa:c:${id}`,
  stage: (concept: string, stage: string) => `dsa:s:${concept}/${stage}`,
  checkpointQuiz: (nodeId: string) => `dsa:cpq:${nodeId}`,
  trace: (id: string) => `dsa:tr:${id}`,
  lab: (id: string) => `dsa:lab:${id}`,
  gate: (world: string, region: string, n: string | number) => `dsa:gate:${world}:${region}:${n}`,
};

/** learning_progress rows for DSA (course_id 'dsa'): lessons are week=<module>, lesson_slug=<concept>; problems week='problems'. */
export const DSA_COURSE_ID = "dsa";
export const DSA_PROBLEMS_WEEK = "problems";
