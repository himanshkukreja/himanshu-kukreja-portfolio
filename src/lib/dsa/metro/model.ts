/**
 * The metro map's model: stations (the outline's modules placed by layout.ts) with their progress state, the line graph,
 * the learner's route and the goal choices. Pure, so node --test runs it (scripts/tests/dsa-metro.test.mjs).
 *
 * - Station state: done (every written lesson of the topic is done), prog (some are), todo. A topic with nothing written
 *   yet is todo and `planned`.
 * - Route: the shortest path over the line segments from where the learner is to the goal; "N stops" counts the stops
 *   still to finish, the current one included. Nothing is locked: the route only recommends.
 */
import type { Outline } from "../outline";
// @ts-expect-error TS5097 (the .ts extension lets node --test load this file; the bundler resolves it too)
import { EDGES, INTERVIEW_GOAL, LINE_OF_PART, LINE_ORDER, LINKS, MILESTONES, STATIONS, type EdgeSpec, type LineId, type Side } from "./layout.ts";

export type StationState = "done" | "prog" | "todo";

export type Station = {
  id: string;
  /** the short name on the map */
  label: string;
  x: number;
  y: number;
  side: Side;
  line: LineId;
  /** every line the station is on (the first is its own; more than one = an interchange) */
  lines: LineId[];
  note?: string;
  state: StationState;
  /** written lessons done, written lessons, all lessons (planned included) */
  done: number;
  total: number;
  all: number;
  problems: number;
  solved: number;
  minutes: number;
  planned: boolean;
  /** the written lessons' concept ids, in course order (the toolbox dates a finished station by their finish times) */
  lessonIds: string[];
  /** the first lesson not done (or the first), null while nothing is written */
  href: string | null;
  nextLesson: number;
  regionCode: string;
};

export type Progress = { concepts: ReadonlySet<string>; solved: ReadonlySet<string> };
export type ProblemRef = { id: string; concept: string; level?: "easy" | "medium" | "hard" };

/** THE "station done" rule, used by the map, the route, the toolbox and the tool toasts: it has written lessons and every one is done. */
export const stationDone = (builtConceptIds: readonly string[], concepts: ReadonlySet<string>) => builtConceptIds.length > 0 && builtConceptIds.every((c) => concepts.has(c));

export type Metro = {
  stations: Station[];
  byId: Map<string, Station>;
  lines: { id: LineId; title: string }[];
  adj: Map<string, string[]>;
  edges: (EdgeSpec & { done: boolean })[];
  links: [string, string][];
};

export function lineOfPart(partId: string, index: number): LineId {
  return LINE_OF_PART[partId] ?? LINE_ORDER[index % LINE_ORDER.length];
}

export function buildMetro(outline: Outline, progress: Progress, problems: ProblemRef[] = []): Metro {
  const mods = new Map<string, { mod: Outline["parts"][number]["modules"][number]; part: number }>();
  const lineTitle = new Map<LineId, string>();
  outline.parts.forEach((p, i) => {
    lineTitle.set(lineOfPart(p.id, i), p.title);
    for (const m of p.modules) mods.set(m.regionId, { mod: m, part: i });
  });
  const byConcept = new Map<string, number>();
  for (const p of problems) byConcept.set(p.concept, (byConcept.get(p.concept) || 0) + 1);
  const solvedBy = new Map<string, number>();
  for (const p of problems) if (progress.solved.has(p.id)) solvedBy.set(p.concept, (solvedBy.get(p.concept) || 0) + 1);

  const stations: Station[] = [];
  for (const s of STATIONS) {
    const hit = mods.get(s.id);
    if (!hit) continue;
    const { mod, part } = hit;
    const built = mod.lessons.filter((l) => l.built);
    const done = built.filter((l) => progress.concepts.has(l.conceptId)).length;
    const firstOpen = built.findIndex((l) => !progress.concepts.has(l.conceptId));
    const pick = firstOpen >= 0 ? firstOpen : 0;
    stations.push({
      id: s.id,
      label: s.label,
      x: s.x,
      y: s.y,
      side: s.side,
      line: lineOfPart(outline.parts[part].id, part),
      lines: [lineOfPart(outline.parts[part].id, part), ...(s.also || [])],
      note: s.note,
      state: stationDone(built.map((l) => l.conceptId), progress.concepts) ? "done" : done > 0 ? "prog" : "todo",
      done,
      total: built.length,
      all: mod.lessons.length,
      problems: built.reduce((n, l) => n + (byConcept.get(l.conceptId) || 0), 0),
      solved: built.reduce((n, l) => n + (solvedBy.get(l.conceptId) || 0), 0),
      minutes: mod.minutes,
      planned: built.length === 0,
      lessonIds: built.map((l) => l.conceptId),
      href: built[pick]?.href ?? null,
      nextLesson: pick + 1,
      regionCode: mod.regionCode,
    });
  }
  const byId = new Map(stations.map((s) => [s.id, s]));
  const edges = EDGES.filter((e) => byId.has(e.from) && byId.has(e.to)).map((e) => ({ ...e, done: byId.get(e.from)!.state === "done" && byId.get(e.to)!.state === "done" }));
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push(e.to);
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push(e.from);
  }
  const lines = LINE_ORDER.filter((l) => stations.some((s) => s.line === l)).map((id) => ({ id, title: lineTitle.get(id) || id }));
  return { stations, byId, lines, adj, edges, links: LINKS.filter(([a, b]) => byId.has(a) && byId.has(b)) };
}

/** The shortest route from `from` to `to` over the line segments (station ids, both ends included); [] when not connected. */
export function computeRoute(adj: Map<string, string[]>, from: string, to: string): string[] {
  if (from === to) return [from];
  const prev = new Map<string, string>([[from, ""]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of adj.get(cur) || []) {
      if (prev.has(n)) continue;
      prev.set(n, cur);
      if (n === to) {
        const out = [to];
        for (let c = cur; c; c = prev.get(c)!) out.unshift(c);
        return out;
      }
      queue.push(n);
    }
  }
  return [];
}

export type GoalKind = "scratch" | "topic" | "interview";
export type GoalPref = { kind: GoalKind; station?: string };

/** The goal station for the learner's choice. Never the finished one: a reached goal moves on to the next milestone. */
export function goalStation(metro: Pick<Metro, "byId">, pref: GoalPref | null | undefined, here: string): string {
  const open = (id: string) => metro.byId.has(id) && metro.byId.get(id)!.state !== "done";
  const kind = pref?.kind || "scratch";
  if (kind === "topic" && pref?.station && metro.byId.has(pref.station)) return pref.station;
  if (kind === "interview") return metro.byId.has(INTERVIEW_GOAL) ? INTERVIEW_GOAL : here;
  const next = MILESTONES.find(open);
  return next ?? MILESTONES.filter((m) => metro.byId.has(m)).pop() ?? here;
}

export type RouteInfo = {
  /** station ids, from here to the goal */
  ids: string[];
  goal: string;
  stops: number;
  lessons: number;
  minutes: number;
};

/** The route card's numbers: stops still to finish, their unfinished lessons and reading time. */
export function routeInfo(metro: Metro, here: string, pref: GoalPref | null | undefined, progress: Progress & { lessonMinutes?: Record<string, number> }, outline?: Outline): RouteInfo {
  const goal = goalStation(metro, pref, here);
  let ids = computeRoute(metro.adj, here, goal);
  if (!ids.length) ids = [here];
  let lessons = 0;
  let minutes = 0;
  if (outline) {
    for (const part of outline.parts)
      for (const m of part.modules)
        if (ids.some((id) => metro.byId.get(id)?.regionCode === m.regionCode))
          for (const l of m.lessons) if (l.built && !progress.concepts.has(l.conceptId)) { lessons++; minutes += l.minutes; }
  }
  return { ids, goal, stops: ids.filter((id) => metro.byId.get(id)?.state !== "done" || id === here).length, lessons, minutes };
}

/** Is a station on the line (its own or an interchange)? */
export const onLine = (s: Pick<Station, "lines">, line: LineId) => s.lines.includes(line);

/** Plain-language sentence for an interchange: "Hashing is on two lines: Data structures and Patterns." */
export function interchangeText(s: Station, title: (l: LineId) => string): string {
  if (s.lines.length < 2) return "";
  const names = s.lines.map(title);
  const count = ["", "one", "two", "three"][s.lines.length] || String(s.lines.length);
  return `${s.label} is on ${count} lines: ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}.`;
}

/**
 * The neighbour to move to for an arrow key: of the stations next to `from` on a line, the one most in that direction
 * (null when none lies within about 60 degrees of it).
 */
export function stepToward(metro: Pick<Metro, "adj" | "byId">, from: string, dir: "left" | "right" | "up" | "down"): string | null {
  const a = metro.byId.get(from);
  if (!a) return null;
  const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
  let best: string | null = null;
  let bestScore = 0.5;
  for (const id of metro.adj.get(from) || []) {
    const b = metro.byId.get(id)!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const score = (dx * d[0] + dy * d[1]) / len;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  if (best) return best;
  // no line leads that way: the nearest station roughly in that direction (so the arrow keys never dead-end)
  let nearest = Infinity;
  for (const b of metro.byId.values()) {
    if (b.id === from) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    if ((dx * d[0] + dy * d[1]) / len > 0.8 && len < nearest) {
      nearest = len;
      best = b.id;
    }
  }
  return best;
}

/**
 * Where the learner is: the station of the last lesson they finished, if that topic is not done yet; otherwise the first
 * topic in course order that has written lessons and is not done (nothing done yet: the first). One rule for the map,
 * the route card, the station card and the phone strip, all of which read the same station states.
 */
export function currentStation(outline: Outline, metro: Pick<Metro, "byId">, progress: Progress): string {
  const order = outline.parts.flatMap((p) => p.modules.map((m) => ({ id: m.regionId, lessons: m.lessons }))).filter((m) => metro.byId.has(m.id));
  const open = (id: string) => {
    const s = metro.byId.get(id)!;
    return !s.planned && s.state !== "done";
  };
  let last = "";
  for (const m of order) if (m.lessons.some((l) => l.built && progress.concepts.has(l.conceptId))) last = m.id;
  if (last && open(last)) return last;
  return order.find((m) => open(m.id))?.id ?? (last || order[0]?.id) ?? "";
}

export type StationLesson = {
  n: number;
  conceptId: string;
  title: string;
  /** the lesson's page; null while it is planned */
  href: string | null;
  minutes: number;
  /** done, the one the learner is on (first not done) or not started */
  status: "done" | "now" | "todo";
};

/** The lessons of a station, from the same outline the List view reads: number, title, status, minutes, link. */
export function stationLessons(outline: Outline, station: Pick<Station, "regionCode">, progress: Pick<Progress, "concepts">): { lessons: StationLesson[]; moduleId: string } | null {
  for (const part of outline.parts)
    for (const m of part.modules) {
      if (m.regionCode !== station.regionCode) continue;
      let nowSet = false;
      const lessons = m.lessons.map((l, i): StationLesson => {
        const done = l.built && progress.concepts.has(l.conceptId);
        const now = !done && l.built && !nowSet;
        if (now) nowSet = true;
        return { n: i + 1, conceptId: l.conceptId, title: l.title, href: l.built ? l.href : null, minutes: l.minutes, status: done ? "done" : now ? "now" : "todo" };
      });
      return { lessons, moduleId: m.moduleId };
    }
  return null;
}
