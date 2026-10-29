import "server-only";
/**
 * The content-gap radar's report: read every source, group the asks into topics (cluster.ts), find each
 * topic's closest course material and decide gap / thin / covered. Admin-only (GET /api/admin/gaps), so it
 * runs on demand; the result is kept 5 minutes per window on the instance.
 *
 * Verdict, from two signals:
 *   the asks   share that came back partial or with nothing (the feature's own scope)
 *   the index  the best match for the most asked wording: nothing, weak (passing mentions only), only minor
 *              kinds (FAQs, cards, reading) near the top, or a lesson / concept / lecture that teaches it
 * gap: no or weak match, words the course never uses, or >= 60% of asks partial/empty
 * thin: only minor kinds near the top, or >= 25% of asks partial/empty
 * covered: otherwise
 */
import { getCatalogue } from "@/lib/concepts/load";
import type { SmartEngine } from "@/lib/search/smart/engine";
import { getEngine, liveCheck } from "@/lib/search/smart/server";
import { ASKS, GROUPS } from "@/lib/search/smart/synonyms";
import type { Kind } from "@/lib/search/smart/types";
import { buildVocab, clusterEvents, type Cluster } from "./cluster";
import { chatSource } from "./sources/chat";
import { fixtureSource, gapFixtures } from "./sources/fixtures";
import { searchLogSource } from "./sources/search";
import type { GapEvent, GapLabel, GapMaterial, GapReport, GapSourceStatus, GapTopic } from "./types";

/** the engine's own "weak match" line (engine.ts WEAK) */
const WEAK = 12;
const CORE: ReadonlySet<Kind> = new Set<Kind>(["lesson", "section", "concept", "lecture", "quest", "problem", "lld", "lab", "case", "war"]);
const MAX_TOPICS = 300;
const TTL = 5 * 60_000;

const memo = new Map<string, { at: number; report: Promise<GapReport> }>();

export function gapReport(opts: { days: number; origin: string; fresh?: boolean }): Promise<GapReport> {
  const sample = gapFixtures();
  const k = `${opts.days}|${sample}`;
  const hit = memo.get(k);
  if (hit && !opts.fresh && Date.now() - hit.at < TTL) return hit.report;
  const report = build(opts.days, opts.origin, sample);
  memo.set(k, { at: Date.now(), report });
  report.catch(() => memo.delete(k));
  return report;
}

async function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => (t = setTimeout(() => rej(new Error(`${what} timed out`)), ms)))]);
  } finally {
    clearTimeout(t);
  }
}

async function loadEvents(since: Date, sample: boolean): Promise<{ events: GapEvent[]; sources: GapSourceStatus[] }> {
  if (sample) {
    const r = await fixtureSource.load(since);
    return { events: r.events, sources: [{ id: fixtureSource.id, label: fixtureSource.label, status: r.status, events: r.events.length }] };
  }
  // smart search's own query log and the chat's search_course calls; the 30-day ai_transcripts (kept for
  // abuse checks) are deliberately not read here: the owner approved the query log for this purpose, not them
  const [log, chat] = await Promise.all([searchLogSource.load(since), chatSource.load(since)]);
  const status = (s: { id: string; label: string }, r: { status: GapSourceStatus["status"]; events: GapEvent[]; note?: string }): GapSourceStatus => ({ id: s.id, label: s.label, status: r.status, events: r.events.length, note: r.note });
  return {
    events: [...log.events, ...chat.events],
    sources: [status(searchLogSource, log), status(chatSource, chat)],
  };
}

const material = (d: { id: string; kind: Kind; title: string; sub: string; href: string }): GapMaterial => ({ id: d.id, kind: d.kind, title: d.title, sub: d.sub, href: d.href });

function judge(c: Cluster, engine: SmartEngine | null, live: (gate: string) => boolean): { closest: GapMaterial[]; verdict: GapLabel; why: string; gapShare: number | null } {
  let known = 0;
  let missed = 0;
  for (const e of c.events) {
    if (!e.scope || e.scope === "off_topic") continue;
    known++;
    if (e.scope === "partial" || e.scope === "none") missed++;
  }
  const gapShare = known ? missed / known : null;
  const best = [...c.queries].sort((a, b) => b[1] - a[1])[0]?.[0] ?? c.label;

  // closest material: what the asks' answers cited most, else what the index ranks first for the top wording
  let closest: GapMaterial[] = [];
  let index: "none" | "weak" | "minor" | "strong" | null = null;
  if (engine) {
    const cited = [...c.top].sort((a, b) => b[1] - a[1]).map(([id]) => engine.doc(id)).filter((d): d is NonNullable<typeof d> => !!d && live(d.gate));
    const { ranked } = engine.rank(best, { live, limit: 40 });
    const top = ranked[0]?.score ?? 0;
    const near = ranked.slice(0, 5).filter((r) => r.score >= top * 0.6);
    index = !ranked.length ? "none" : top < WEAK ? "weak" : near.some((r) => CORE.has(r.doc.kind)) ? "strong" : "minor";
    const seen = new Set<string>();
    for (const d of [...cited, ...ranked.slice(0, 8).map((r) => r.doc)]) {
      const fam = engine.family(d);
      if (seen.has(fam)) continue;
      seen.add(fam);
      closest.push(material(d));
      if (closest.length >= 3) break;
    }
    if (index === "none") closest = [];
  }

  const pct = gapShare === null ? "" : `${Math.round(gapShare * 100)}% of asks came back partial or empty`;
  if (c.via === "new-words") return { closest, verdict: "gap", why: `words the course never uses${pct ? `; ${pct}` : ""}`, gapShare };
  if (index === "none") return { closest, verdict: "gap", why: "nothing in the course matches", gapShare };
  if (index === "weak") return { closest, verdict: "gap", why: `only passing mentions in the course${pct ? `; ${pct}` : ""}`, gapShare };
  if (gapShare !== null && gapShare >= 0.6) return { closest, verdict: "gap", why: pct, gapShare };
  if (index === "minor") return { closest, verdict: "thin", why: `no lesson, concept or lecture near the top, only FAQs, cards or reading${pct ? `; ${pct}` : ""}`, gapShare };
  if (gapShare !== null && gapShare >= 0.25) return { closest, verdict: "thin", why: pct, gapShare };
  return { closest, verdict: "covered", why: index === "strong" ? `the course teaches it${pct ? `; ${pct}` : ""}` : pct || "no gap signal", gapShare };
}

async function build(days: number, origin: string, sample: boolean): Promise<GapReport> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [{ events, sources }, catalogue, engineR, live] = await Promise.all([
    loadEvents(since, sample),
    getCatalogue().then((r) => r.catalogue.concepts.map((c) => ({ id: c.id, term: c.term, aliases: c.aliases }))),
    withTimeout(getEngine(origin), 45_000, "search index").then(
      (e) => ({ engine: e, error: undefined as string | undefined }),
      (e: unknown) => ({ engine: null, error: e instanceof Error ? e.message : String(e) }),
    ),
    liveCheck().catch(() => () => true),
  ]);
  const engine = engineR.engine;
  const vocab = buildVocab(GROUPS, ASKS, catalogue);

  const fresh = new Map<string, boolean>();
  const isNew = engine
    ? (w: string) => {
        let v = fresh.get(w);
        if (v === undefined) {
          v = fresh.size < 3000 ? engine.rank(w, { live, limit: 1 }).ranked.length === 0 : false;
          fresh.set(w, v);
        }
        return v;
      }
    : undefined;
  const { clusters, offTopic } = clusterEvents(events, vocab, isNew);

  const ranked = clusters.sort((a, b) => b.users.size - a.users.size || b.events.length - a.events.length).slice(0, MAX_TOPICS);
  const topics: GapTopic[] = ranked.map((c) => {
    const j = judge(c, engine, live);
    const bySource: GapTopic["bySource"] = {};
    let first = c.events[0].day;
    let last = c.events[0].day;
    for (const e of c.events) {
      bySource[e.source] = (bySource[e.source] ?? 0) + 1;
      if (e.day < first) first = e.day;
      if (e.day > last) last = e.day;
    }
    return {
      key: c.key,
      label: c.label,
      via: c.via,
      conceptId: c.conceptId,
      count: c.events.length,
      users: c.users.size,
      bySource,
      gapShare: j.gapShare,
      examples: [...c.queries].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([q, n]) => ({ q, n })),
      closest: j.closest,
      verdict: j.verdict,
      why: j.why,
      firstDay: first,
      lastDay: last,
    };
  });

  const allUsers = new Set(events.filter((e) => e.user && e.scope !== "off_topic").map((e) => e.user));
  const n = (v: GapLabel) => topics.filter((t) => t.verdict === v).length;
  return {
    generatedAt: new Date().toISOString(),
    days,
    sample,
    sources,
    totals: { asks: events.length - offTopic, users: allUsers.size, topics: topics.length, offTopic, gap: n("gap"), thin: n("thin"), covered: n("covered") },
    topics,
    ...(engineR.error ? { engineError: engineR.error } : {}),
  };
}
