/**
 * Side-quest lectures (resources/lectures/<quest slug>.json, format in that folder's README): scenes
 * that build up and animate as the narrator speaks. v2 adds list, compare, quiz, chart, timeline and
 * phone scenes, and per-step packets (`flow`), camera (`focus`), reveals and pauses.
 */
export type Tone = "bad" | "good" | "hot" | "neutral";
export type LectureStep = {
  say: string;
  /** mock interview videos: who says this line (the lecture's `cast`) */
  who?: "interviewer" | "candidate";
  caption?: string;
  highlight?: string[];
  upto?: number;
  reveal?: number;
  pause?: number;
  flow?: string[];
  focus?: string[];
  screen?: number;
  /** leans on an earlier lesson: "↩ Recall · label", and in the course player a link to its lecture */
  ref?: { lecture: string; label: string };
  /** DSA array scenes: the window [left, right] (inclusive; right = left - 1 is an empty window) */
  window?: [number, number];
  /** DSA array scenes: cells picked out on their own (not a window) */
  mark?: number[];
  /** DSA array scenes: named pointers under cells, e.g. { left: 1, right: 3 } */
  pointers?: Record<string, number>;
  /** DSA trace scenes: which frame of the trace is on screen */
  frame?: number;
  /** DSA code scenes: the template's step markers ([1], [2], …) lit on this step */
  markers?: number[];
  /** DSA chain scenes (linked lists): node ids left to right; each id's next / prev id (null = null); named labels on
   * ids (head, curr, prev, slow, fast; null = pointing at null); the running pointer-hop count */
  order?: number[];
  next?: (number | null)[];
  prev?: (number | null)[];
  labels?: Record<string, number | null>;
  cost?: number;
  /** DSA grid scenes (BFS/DFS): the search after this many cells were visited ("end": the finished run; 0: the start; unset: the bare grid) */
  visited?: number | "end";
  /** DSA stack scenes: an item in flight above the top (about to be pushed, or just popped), the value a frame returns by id (the call stack), and a result chip */
  lift?: number | null;
  ret?: Record<string, string>;
  out?: string;
  /** DSA stack scenes: the array's cells from this step on (it grew), overriding the scene's capacity */
  capacity?: number;
  /** DSA queue scenes: the ring's cell holding the front item (default 0), the end an item in flight is at, the cell it hovers over (default: the tail, or just before the head), and a pointer that wrapped round this step */
  head?: number;
  liftAt?: "front" | "back";
  liftCell?: number;
  wrap?: "head" | "tail";
  /** DSA queue "window" scenes (sliding-window maximum): the index that has just arrived, the answers so far, and the index leaving the deque (`order` is the deque's indexes, `window` the window) */
  cur?: number;
  results?: number[];
  drop?: number;
  /** DSA tree scenes (a binary search tree): the node ids in the tree this step (default: all), links changed this step (each id's left / right child id or null), the ids walked so far, the node looked at, a node found or just linked in, a walk's output so far (node ids in the order visited) and its label */
  nodes?: number[];
  leftOf?: (number | null)[];
  rightOf?: (number | null)[];
  path?: number[];
  current?: number;
  found?: number;
  seq?: number[];
  seqTitle?: string;
  /** DSA heap scenes: the heap's array after this step (a step without it keeps the last array), and two indexes swapped or compared this step */
  values?: number[];
  swap?: number[];
  compare?: number[];
  /** DSA graph scenes: the edges after this step (each [from, to] or [from, to, weight]; a step without it keeps the last edges), the edge in focus this step, and what to draw from this step on */
  edges?: number[][];
  edge?: number[];
  show?: "graph" | "list" | "matrix" | "both" | "all";
  /** DSA graph scenes, shortest paths (A2): each vertex's distance (null: not reached), the vertices whose distance is final and Dijkstra's waiting heap as [distance, vertex] entries (a third item of 1 marks a stale one); each stays until a later step sets it again */
  dist?: (number | null)[];
  done?: number[];
  heap?: number[][];
  /** DSA graph scenes, topological sort (A3): each vertex's in-degree, Kahn's ready queue, the order built so far and the vertices stuck in a cycle (warning colour); each stays until a later step sets it again */
  indeg?: number[];
  ready?: number[];
  topo?: number[];
  stuck?: number[];
  /** DSA graph scenes, union-find (A4): each vertex's parent (a root is its own parent) and each root's group size; the scene draws the forest of trees, and each stays until a later step sets it again */
  parent?: number[];
  size?: number[];
  /** DSA intervals scenes: the talks taken and skipped so far (each stays until a later step sets it again), the talks in focus (`hot`), and the hour the last talk taken ends (a line); `current` is the talk being looked at */
  picked?: number[];
  skipped?: number[];
  hot?: number[];
  lastEnd?: number;
  /** DSA dp scenes (A6): table cells filled from this step on as [row, column, text] (each stays; a 1-D table uses row 0), the cell being filled and the cells it reads from (this step only), and for a recursion tree the calls shown so far (`shown`, each stays), the calls that repeat an earlier call and the calls the memo answers (each stays until a later step sets it again), with `hot` calls in focus and `ret` the value each call (by number) has returned */
  put?: [number, number, string][];
  now?: [number, number];
  reads?: [number, number][];
  shown?: number;
  repeat?: number[];
  hit?: number[];
  /** DSA chars scenes (A7): the text index under the pattern's first letter, text indexes that differ (warning colour), letter counts so far (each stays), and the count slot in focus; `mark` holds the matched indexes, `window` a finished match and `pointers` the named pointers */
  shift?: number;
  bad?: number[];
  tally?: Record<string, number>;
  slot?: string;
  /** DSA trie scenes: the words after this step, a half-inserted word, the prefix walked (the node in focus), new and lit nodes (prefixes), the end marker in focus */
  words?: string[];
  grow?: string;
  walk?: string;
  fresh?: string[];
  lit?: string[];
  endAt?: string;
};
export type SceneKind =
  | "title"
  | "numbers"
  | "flowchart"
  | "sequence"
  | "state"
  | "list"
  | "compare"
  | "quiz"
  | "chart"
  | "timeline"
  | "phone"
  // DSA Mastery (src/lib/dsa/lecture.ts inlines their data, so the stage needs no fetches)
  | "quote"
  | "array"
  | "trace"
  | "race"
  | "code"
  | "chain"
  | "grid"
  | "stack"
  | "queue"
  | "tree"
  | "heap"
  | "graph"
  | "trie"
  | "intervals"
  | "dp"
  | "chars";

/** A DSA trace frame, as the stage draws it (dsa-mastery generated/traces/<id>.json, trimmed). */
export type LectureTraceFrame = {
  marker: number;
  note: string;
  state: Record<string, unknown>;
  view: { window?: [number, number] | null; pointers?: Record<string, number>; leaving?: number | null; joining?: number | null; map?: Record<string, number> | null; need?: Record<string, number> | null };
  /** the frame's prediction prompt: which variable the learner is asked for */
  ask?: string | null;
};
export type LectureTrace = { title: string; values: unknown[]; vars: string[]; frames: LectureTraceFrame[]; code?: LectureCode; lang?: string };
export type LectureRace = { title: string; unit: string; sizes: number[]; series: { label: string; counts: number[]; tone: string }[]; note: string };
/** A code template: its source and, per step marker n (1-based), the 0-based lines it covers. */
export type LectureCode = { label: string; source: string; lines: number[][] };
export type LectureScene = {
  id: string;
  title: string;
  kind: SceneKind;
  heading?: string;
  numbers?: { value: string; label: string }[];
  diagram?: string;
  points?: string[] | { label: string; value: number; tone?: Tone }[];
  left?: { title: string; points: string[]; tone?: Tone };
  right?: { title: string; points: string[]; tone?: Tone };
  question?: string;
  options?: string[];
  answer?: number;
  explain?: string;
  type?: "bar" | "line";
  unit?: string;
  events?: { at: string; text: string; tone?: Tone }[];
  app?: string;
  screens?: { title: string; rows: { text: string; meta?: string; tone?: Tone }[]; toast?: string }[];
  /** DSA quote: a cast id, the line, and (resolved) who they are */
  who?: string;
  text?: string;
  person?: { name: string; role: string };
  /** DSA array; DSA chain: the nodes' values by id */
  values?: (number | string)[];
  /** DSA chain: a doubly linked list (prev arrows too); each node's memory address (the memory picture); the counter's unit */
  doubly?: boolean;
  addresses?: number[];
  /** DSA queue "window": the window width */
  k?: number;
  costUnit?: string;
  /** DSA grid: rows of `.#SG` (open, wall, start, goal) and the search the steps play */
  grid?: string[];
  algorithm?: "bfs" | "dfs";
  /** DSA stack: how it is drawn (array cells, list nodes, call-stack frames) and the cells the array has; DSA queue: "ring" (cells, head and tail), "list" (nodes; `doubly` draws both arrows) or "window" (the sliding-window maximum, `values` is the stream, `k` the window width) */
  mode?: "array" | "list" | "calls" | "ring" | "window";
  capacity?: number;
  /** DSA tree: each node left and right child id (null = none), the root id (default 0), and numbered levels down the left */
  leftOf?: (number | null)[];
  rightOf?: (number | null)[];
  root?: number;
  levels?: boolean;
  /** DSA heap: `values` is the heap's array; write each cell's index, what to draw (the tree and the array, only the tree, or only the array) and min-heap or max-heap */
  indexes?: boolean;
  view?: "both" | "tree" | "array" | "graph" | "list" | "matrix" | "all";
  kindOfHeap?: "min" | "max";
  /** DSA graph: the number of vertices (0 to n - 1), the edges at the start (each [from, to] or [from, to, weight]) and whether they are directed; `view` also takes "graph", "list", "matrix" and "all" for a graph scene */
  vertices?: number;
  edges?: number[][];
  directed?: boolean;
  /** DSA trie: the words stored at the start (lowercase letters) */
  words?: string[];
  /** DSA intervals (greedy choices, A5): the talks as [start, end] in whole hours (2 to 8; talk 0 is A, talk 1 is B, ...), drawn as bars on an hour axis */
  spans?: number[][];
  /** DSA dp (A6): a table (`cols`, optional `rows` for a 2-D table, `base` cells drawn dashed, `blocked` closed cells) or a recursion tree (`calls`: each call as [label, parent call or -1], in the order the calls are made) */
  dp?: { cols?: string[]; rows?: string[]; base?: [number, number][]; blocked?: [number, number][]; calls?: [string, number][] };
  /** DSA chars (A7 string basics): a string as a strip of letters (`text`, 1 to 24 characters), an optional `pattern` drawn under it, and `counts: true` for a 26-slot letter array */
  chars?: { text: string; pattern?: string; counts?: boolean };
  /** DSA trace / race / code: the id in the content repo, and (resolved) its data */
  trace?: string;
  traceData?: LectureTrace;
  race?: string;
  raceData?: LectureRace;
  template?: string;
  lang?: string;
  code?: LectureCode;
  steps: LectureStep[];
};
export type CastMember = { name: string; title?: string; voice: string };

export type Lecture = {
  v?: number;
  /** the lecture's id: a side quest's slug, or "<week>--<lesson slug>" for a course lesson (also
   * "problem-bank--<slug>", "low-level-design--<slug>" and "case-files--<story slug>") */
  quest: string;
  /** course lessons, interview problems, LLD and case files: which page this teaches */
  lesson?: { week: string; slug: string; kind: "preview" | "lesson" | "capstone" | "problem" | "lld" | "case" | "interview" | "story" };
  /** mock interview videos: the two people on the call, each with a Kokoro voice */
  cast?: { interviewer: CastMember; candidate: CastMember };
  /** a vertical short (resources/shorts/shorts--<long id>.json, rendered 1080x1920): the lecture it comes
   *  from, its written article, and the label shown on top ("W04 · Caching", "Side quest 21", …) */
  short?: {
    of: string;
    article: string;
    label: string;
    /** 1-3 lowercase topic tags for the feed's filters (caching, databases, incidents, …) */
    topics?: string[];
    /** where this idea sits in the long lecture: a scene id there (the "full lecture" link opens at it) */
    at?: string;
    /** background music mood (scripts/lecture/music_moods.py): tension, drive, lofi, playful, bright */
    music?: "tension" | "drive" | "lofi" | "playful" | "bright";
  };
  /** a DSA Mastery concept lecture (resolved by src/lib/dsa/lecture.ts): the concept it teaches; the stage turns teal */
  dsa?: { module: string; concept: string };
  /** a DSA lesson's in-article clip (10-20 s, 16:9 720p, no music): its lesson, its id in clips.json, the caption under it */
  clip?: { lesson: string; id: string; caption: string };
  /** a DSA problem's solution video (the editorial tab): which problem it solves */
  solution?: { problem: string };
  title: string;
  summary: string;
  scenes: LectureScene[];
};

/** The playlist section's anchor: "W04 · Caching" → "w04-caching", "Side quests" → "side-quests". */
export const lectureGroupAnchor = (group: string) => group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Short code for a playlist section: "W04", "SQ", "PB", "LLD", "CF". */
export const lectureGroupCode = (group: string) =>
  /^W\d+/.test(group) ? group.match(/^W\d+/)![0] : group === "Side quests" ? "SQ" : group === "Interview problems" ? "PB" : group === "Low-level design" ? "LLD" : group === "Case files" ? "CF" : group === "War stories" ? "WS" : group.slice(0, 3).toUpperCase();

/** A course lesson's lecture id (side quests use their slug). */
export const lessonLectureId = (week: string, slug: string) => `${week}--${slug}`;

/** One step of the whole lecture, in order. */
export type FlatStep = { n: number; scene: number; step: number; s: LectureScene; st: LectureStep };
export const flatten = (l: Lecture): FlatStep[] => {
  let n = 0;
  return l.scenes.flatMap((s, scene) => s.steps.map((st, step) => ({ n: n++, scene, step, s, st })));
};

/** Seconds a step lasts without recorded audio: reading pace plus its pause (the player's timeline rule). */
export const estimateStep = (say: string, pause = 0) => say.split(/\s+/).length / 2.6 + 0.5 + pause;

/** Where each step starts when there is no recording to time it (the player and transcript search agree). */
export const estimatedStarts = (flat: FlatStep[]): number[] => {
  const out: number[] = [];
  let acc = 0;
  for (const f of flat) {
    out.push(acc);
    acc += estimateStep(f.st.say, f.st.pause);
  }
  return out;
};

/** Recorded narration for a lecture: where each step starts in the audio (seconds). */
export type LectureMedia = {
  /** hash of the lecture JSON the audio was made from; a mismatch means the audio is stale */
  source: string;
  audio: string;
  /** soft background music, looped under the narration */
  music?: string;
  video?: string;
  poster?: string;
  captions?: string;
  duration: number;
  starts: number[];
};

export function stepSource(scene: LectureScene, step: LectureStep): string | null {
  const src = scene.diagram?.trim();
  if (!src) return null;
  if (scene.kind === "sequence") {
    if (!step.upto) return src;
    const lines = src.split("\n");
    const out: string[] = [];
    let shown = 0;
    let open = 0;
    // blocks opened after the cut are dropped whole: their "end" goes too
    let skipped = 0;
    for (const line of lines) {
      const t = line.trim();
      const isMsg = /(-{1,2}>>|-{1,2}x|-{1,2}\)|-{1,2}>)/.test(t) || /^Note\s/i.test(t);
      const opens = /^(alt|opt|loop|par|critical|break|rect)\b/i.test(t);
      const isEnd = /^end$/i.test(t);
      if (isMsg) {
        if (shown >= step.upto) continue;
        shown++;
      } else if (opens) {
        if (shown >= step.upto) {
          skipped++;
          continue;
        }
        open++;
      } else if (isEnd) {
        if (skipped > 0) {
          skipped--;
          continue;
        }
        if (open > 0) open--; // else it closes a participant box
      } else if (/^(else|and)\b/i.test(t) && shown >= step.upto) continue;
      out.push(line);
    }
    for (; open > 0; open--) out.push("  end");
    return out.join("\n");
  }
  const ids = (step.highlight || []).filter((x) => /^[A-Za-z0-9_]+$/.test(x));
  if (!ids.length) return src;
  return `${src}\n  classDef lit fill:#3a1a08,stroke:#FF6B2B,stroke-width:3px,color:#ffffff\n  class ${ids.join(",")} lit`;
}
