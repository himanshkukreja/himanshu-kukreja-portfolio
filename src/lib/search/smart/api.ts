/**
 * The smart-search engine behind one async interface, so the same callers (the course chat's tools, /api/search/smart,
 * /api/learn/ai/search, the admin gaps report) work with the engine in this process (Vercel, next dev) or in the
 * separate search Worker on Cloudflare (cloudflare/search/worker.ts): the engine needs ~60 MB, more than the
 * site's Worker has left of its 128 MB ("Worker exceeded memory limit", 8 Nov 2026).
 *
 * Publishing gates: a `live` function can't cross to another Worker, so callers pass `blocked`, the gates that are
 * not live right now (liveCheck() attaches it to its function); docs behind them never come back.
 */
import type { SmartEngine } from "./engine";
import type { Doc, Kind, SmartResults } from "./types";

/** A doc as the search API returns it: with the id of its family (the lesson, quest or lecture it belongs to). */
export type ApiDoc = Doc & { fam: string };
export type RankedDoc = { doc: ApiDoc; score: number; snippet?: string };
export type Analysis = { terms: string[]; qt: { t: string }[]; fixes: SmartResults["fixes"]; askOnly: boolean };
export type GateFilter = { live?: ((gate: string) => boolean) & { blocked?: string[] }; blocked?: string[] };
export type DocQuery = { ids?: string[]; kind?: Kind; parent?: string; hrefs?: string[]; limit?: number };

export interface SearchApi {
  /** ranked docs (gated ones out), snippets for the first `snippets` of them */
  rank(q: string, o?: GateFilter & { limit?: number; snippets?: number }): Promise<{ a: Analysis; ranked: RankedDoc[] }>;
  /** grouped results; each candidate's doc carries its family */
  search(q: string, o?: GateFilter): Promise<SmartResults & { candidates: { doc: ApiDoc; score: number }[] }>;
  /** for each query, how many docs match (at most `limit`): the admin gaps report's "is anything there?" check */
  counts(qs: string[], o?: GateFilter & { limit?: number }): Promise<number[]>;
  /** docs by ids (in that order, missing ones left out), or every doc of a kind / under a parent / at these hrefs */
  docs(q: DocQuery): Promise<ApiDoc[]>;
  readonly built: Promise<string>;
}

export const blockedOf = (o?: GateFilter) => new Set(o?.blocked ?? o?.live?.blocked ?? []);
const gateOk = (d: Doc, blocked: Set<string>) => !d.gate || d.gate.split(" ").every((g) => !blocked.has(g));

/** The engine queries both sides run (the search Worker calls these too). */
export function engineRank(e: SmartEngine, q: string, blocked: Set<string>, limit = 400, snippets = 0) {
  const { a, ranked } = e.rank(q, { live: (g) => !blocked.has(g), limit });
  const terms = [...new Set([...a.terms, ...a.qt.map((x) => x.t)])];
  return {
    a: { terms: a.terms, qt: a.qt.map((x) => ({ t: x.t })), fixes: a.fixes, askOnly: a.askOnly },
    ranked: ranked.map((r, i) => ({ doc: withFam(e, r.doc), score: r.score, ...(i < snippets ? { snippet: e.snippet(r.doc, terms) } : {}) })),
  };
}

export function engineSearch(e: SmartEngine, q: string, live: (g: string) => boolean) {
  const r = e.search(q, { live });
  return { ...r, candidates: r.candidates.map((c) => ({ doc: withFam(e, c.doc), score: c.score })) };
}

export function engineCounts(e: SmartEngine, qs: string[], blocked: Set<string>, limit = 1): number[] {
  return qs.slice(0, 5000).map((q) => e.rank(q, { live: (g) => !blocked.has(g), limit }).ranked.length);
}

export function engineDocs(e: SmartEngine, q: DocQuery, blocked: Set<string>): ApiDoc[] {
  const limit = Math.min(q.limit ?? 500, 2000);
  let out: Doc[];
  if (q.ids) out = q.ids.slice(0, 2000).map((id) => e.doc(id)).filter((d): d is Doc => !!d);
  else if (q.hrefs) {
    const want = new Set(q.hrefs);
    const seen = new Set<string>();
    out = [];
    for (const d of e.docs) {
      if (!want.has(d.href) || seen.has(d.href)) continue;
      seen.add(d.href);
      out.push(d);
    }
  } else out = e.docs.filter((d) => (!q.kind || d.kind === q.kind) && (q.parent === undefined || d.parent === q.parent));
  return out.filter((d) => gateOk(d, blocked)).slice(0, limit).map((d) => withFam(e, d));
}

const withFam = (e: SmartEngine, d: Doc): ApiDoc => ({ ...d, fam: e.family(d) });

/** The engine in this process. */
export class LocalSearch implements SearchApi {
  constructor(private engine: Promise<SmartEngine>) {}
  get built() {
    return this.engine.then((e) => e.built);
  }
  async rank(q: string, o: GateFilter & { limit?: number; snippets?: number } = {}) {
    return engineRank(await this.engine, q, blockedOf(o), o.limit, o.snippets);
  }
  async search(q: string, o: GateFilter = {}) {
    const b = blockedOf(o);
    return engineSearch(await this.engine, q, o.live ?? ((g) => !b.has(g)));
  }
  async counts(qs: string[], o: GateFilter & { limit?: number } = {}) {
    return engineCounts(await this.engine, qs, blockedOf(o), o.limit);
  }
  async docs(q: DocQuery) {
    return engineDocs(await this.engine, q, new Set());
  }
}

type Fetcher = { fetch(input: string, init?: RequestInit): Promise<Response> };

/** The engine in the search Worker, over its service binding. */
export class RemoteSearch implements SearchApi {
  constructor(private svc: Fetcher) {}
  private async call<T>(op: string, body: unknown): Promise<T> {
    const r = await this.svc.fetch(`https://search.internal/${op}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw new Error(`search ${op}: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return (await r.json()) as T;
  }
  get built() {
    return this.call<{ built: string }>("built", {}).then((x) => x.built);
  }
  rank(q: string, o: GateFilter & { limit?: number; snippets?: number } = {}) {
    return this.call<{ a: Analysis; ranked: RankedDoc[] }>("rank", { q, blocked: [...blockedOf(o)], limit: o.limit, snippets: o.snippets });
  }
  search(q: string, o: GateFilter = {}) {
    return this.call<SmartResults & { candidates: { doc: ApiDoc; score: number }[] }>("search", { q, blocked: [...blockedOf(o)] });
  }
  counts(qs: string[], o: GateFilter & { limit?: number } = {}) {
    return this.call<number[]>("counts", { qs, blocked: [...blockedOf(o)], limit: o.limit });
  }
  docs(q: DocQuery) {
    return this.call<ApiDoc[]>("docs", q);
  }
}
