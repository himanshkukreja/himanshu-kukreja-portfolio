import "server-only";
/**
 * The learner brief for the features beyond the chats, on the server (./feature-brief-model.ts has the rules):
 * learnerBrief(userId, { course, feature, ref, … }) for lesson-qa, snip-explain, the lab hint and review, explain-back,
 * the mock and LLD mock interviewers and scorecards, and the design and canvas reviews. Reads the learner's memory
 * notes and outcome log by the verified user id (each bounded, so a slow read leaves the brief out rather than holding
 * the answer up), and names what the log holds as ids from the course's own content (`namerFor`).
 *
 * Memory paused or unavailable: no brief and no outcomes (only the lab's failed-run count, which the page sent).
 */
import { getCatalogue } from "@/lib/concepts/load";
import { getMockInterview } from "@/lib/learn/mock/page-data";
import { getLab } from "@/lib/learn/labs/load";
import { getWarRoom } from "@/lib/learn/war/load";
import { getParsedPaper } from "@/lib/learn/papers/load";
import { loadMemory } from "@/lib/ai/chat/server";
import { dsaNotes, sdmNotes, untag } from "@/lib/ai/chat/memory-model";
import type { MockInterview } from "@/lib/learn/mock/types";
import { loadOutcomes } from "./events";
import type { EventCourse, OutcomeEvent } from "./events-model";
import { featureBriefText, type BriefNotes, type FeatureBriefInput, type Namer } from "./feature-brief-model";

const within = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
const firstClause = (s: string) => s.replace(/\s+/g, " ").split(/(?<=[a-z0-9)])[.;:](\s|$)| — | - /i)[0].trim();

/** Mocks by slug, for naming phases and rubric signals ("p3" → "Capacity estimates", "p3.s2" → its signal's words). */
function mockNames(m: MockInterview) {
  const phase = new Map(m.phases.map((p) => [p.id, p.title]));
  const signal = new Map(m.phases.flatMap((p) => p.rubric.map((s) => [s.id, firstClause(s.text)] as const)));
  return { title: `mock ${m.code} ${m.title}`, item: (id: string) => phase.get(id) ?? signal.get(id) ?? null };
}

/**
 * Names for the refs and ids in these events, loaded from the course content (only the distinct refs among the newest
 * events; every loader is cached). `extra` adds what the route already has (the concept being graded, the mock).
 */
export async function namerFor(events: OutcomeEvent[], extra: { mock?: MockInterview | null } = {}): Promise<Namer> {
  const refs = [...new Set(events.slice(0, 40).map((e) => `${e.kind}|${e.ref}`))].slice(0, 16);
  const slugOf = (e: OutcomeEvent) => e.ref.split("/")[0];
  const mocks = new Map<string, ReturnType<typeof mockNames> | null>();
  if (extra.mock) mocks.set(extra.mock.slug, mockNames(extra.mock));
  const labs = new Map<string, string>();
  const rooms = new Map<string, string>();
  const papers = new Map<string, string>();
  const needCatalogue = refs.some((r) => r.startsWith("explain_back|") && !r.startsWith("explain_back|dsa:"));
  const dsaConcepts = refs.filter((r) => r.startsWith("explain_back|dsa:")).map((r) => r.slice("explain_back|dsa:".length));
  const [cat, dsa] = await Promise.all([
    needCatalogue ? getCatalogue().catch(() => null) : Promise.resolve(null),
    dsaConcepts.length ? import("@/lib/dsa/load").then(({ getConcept }) => Promise.all(dsaConcepts.map((id) => getConcept(id).catch(() => null)))).catch(() => []) : Promise.resolve([]),
    ...refs.map(async (r) => {
      const [kind, ref] = r.split("|");
      const slug = ref.split("/")[0];
      if (kind.startsWith("mock_") || kind === "lld_mock") {
        if (!mocks.has(slug)) mocks.set(slug, null);
        const m = await getMockInterview(slug).catch(() => null);
        if (m) mocks.set(slug, mockNames(m));
      } else if (kind.startsWith("lab_")) {
        const l = await getLab(ref).catch(() => null);
        if (l) labs.set(ref, l.title);
      } else if (kind === "war_room") {
        const w = await getWarRoom(ref).catch(() => null);
        if (w) rooms.set(ref, w.title);
      } else if (kind === "paper") {
        const p = await getParsedPaper(slug).catch(() => null);
        if (p) papers.set(slug, p.title);
      }
    }),
  ]);
  const concepts = new Map<string, { term: string; points: string[] }>();
  for (const c of cat?.catalogue.concepts ?? []) concepts.set(c.id, { term: c.term, points: [c.definition, ...c.refresher] });
  for (const d of dsa as ({ id: string; title: string; invariant?: string; keyPoints: string[] } | null)[]) if (d) concepts.set(`dsa:${d.id}`, { term: d.title, points: [d.invariant ?? "", ...d.keyPoints].filter(Boolean) });
  return {
    ref: (e) => {
      if (e.kind === "explain_back") return concepts.has(e.ref) ? `explain-back on ${concepts.get(e.ref)!.term}` : null;
      if (e.kind.startsWith("mock_") || e.kind === "lld_mock") return mocks.get(slugOf(e))?.title ?? null;
      if (e.kind.startsWith("lab_")) return labs.has(e.ref) ? `lab ${labs.get(e.ref)}` : null;
      if (e.kind === "war_room") return rooms.has(e.ref) ? `war room ${rooms.get(e.ref)}` : null;
      if (e.kind === "paper") return papers.has(slugOf(e)) ? `paper ${papers.get(slugOf(e))} ${e.ref.split("/")[1] ?? ""}`.trim() : null;
      return null;
    },
    item: (e, id) => {
      if (e.kind === "explain_back") {
        const p = concepts.get(e.ref)?.points[Number(id) - 1];
        return p ? firstClause(p) : null;
      }
      if (e.kind.startsWith("mock_") || e.kind === "lld_mock") return mocks.get(slugOf(e))?.item(id) ?? null;
      if (e.kind === "war_room") return /^\d+$/.test(id) ? `call ${id}` : null;
      if (e.kind === "paper") return /^\d+$/.test(id) ? `marking point ${id}` : null;
      return null;
    },
  };
}

export type FeatureBriefOpts = Omit<FeatureBriefInput, "notes" | "events" | "names" | "now" | "course"> & { course?: EventCourse; mockContent?: MockInterview | null };
export type FeatureBrief = {
  text: string;
  lines: string[];
  adapt: string[];
  /** memory on: the brief and outcome recording apply */
  on: boolean;
  /** the learner's outcomes (newest first) and names for them, for the route's compare lines (empty when off) */
  events: OutcomeEvent[];
  names: Namer;
};

export async function featureBrief(userId: string, o: FeatureBriefOpts): Promise<FeatureBrief> {
  const course = o.course ?? "sdm";
  const mem = await within(loadMemory(userId), 2500, null);
  const on = !!mem && mem.available && !mem.paused;
  const events = on ? await within(loadOutcomes(userId), 2500, [] as OutcomeEvent[]) : [];
  const names = on ? await within(namerFor(events, { mock: o.mockContent }), 2500, { ref: () => null, item: () => null } as Namer) : { ref: () => null, item: () => null };
  let notes: BriefNotes | null = null;
  if (on && mem) {
    const m = course === "dsa" ? dsaNotes(mem.memory) : sdmNotes(mem.memory);
    notes = { goals: m.goals, level: m.level, prefs: m.prefs, struggles: m.struggles.map(untag) };
  }
  const b = featureBriefText({ ...o, course, notes, events, names, now: Date.now() });
  return { ...b, on, events, names };
}
