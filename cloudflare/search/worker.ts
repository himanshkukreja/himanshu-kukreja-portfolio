// The course's smart-search engine in its own Worker (sdm-search), for the site's Worker (sdm-course) to call over a
// service binding (src/lib/search/smart/api.ts RemoteSearch). The engine needs ~60 MB while building, more than the
// site's Worker has left of its 128 MB, so it lives here: one Durable Object holds it, loaded from the site's cached
// index routes (/api/search/index/<part>, /api/search/transcripts) and rebuilt in the background every 15 minutes
// while the old one keeps answering. Deployed by .github/workflows/cloudflare-deploy.yml (wrangler.search.jsonc).
import { DurableObject } from "cloudflare:workers";
import { SmartEngine, transcriptDocs } from "../../src/lib/search/smart/engine";
import { INDEX_PARTS, rowToDoc, type Doc, type DocIndex } from "../../src/lib/search/smart/types";
import type { TranscriptIndex } from "../../src/lib/learn/lecture/transcript";
import { engineCounts, engineDocs, engineRank, engineSearch } from "../../src/lib/search/smart/api";

type Fetcher = { fetch(input: string, init?: RequestInit): Promise<Response> };
type Env = { COURSE: Fetcher; SEARCH_ENGINE: DurableObjectNamespace<SearchEngine>; COURSE_ORIGIN?: string };

const TTL = 15 * 60_000;

export class SearchEngine extends DurableObject<Env> {
  private engine: Promise<SmartEngine> | null = null;
  private at = 0;
  private refreshing = false;

  private async load(): Promise<SmartEngine> {
    const origin = this.env.COURSE_ORIGIN || "https://systemdesignmastery.dev";
    const get = async <T>(path: string): Promise<T> => {
      const r = await this.env.COURSE.fetch(`${origin}${path}`, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return (await r.json()) as T;
    };
    // one part at a time: each part's raw JSON is dropped before the next arrives (the 128 MB limit)
    const docs: Doc[] = [];
    const syn: string[][] = [];
    let built = "";
    for (const p of INDEX_PARTS) {
      const part = await get<DocIndex>(`/api/search/index/${p}`);
      for (const r of part.d) docs.push(rowToDoc(r));
      syn.push(...(part.syn ?? []));
      if (part.built > built) built = part.built;
    }
    const moments = await get<TranscriptIndex>("/api/search/transcripts");
    for (const d of transcriptDocs(moments)) docs.push(d);
    return new SmartEngine(docs, `${built}|${moments.built}`, syn);
  }

  private get(): Promise<SmartEngine> {
    if (this.engine && Date.now() - this.at < TTL) return this.engine;
    if (this.engine && !this.refreshing) {
      // stale: answer from the old engine, swap in the new one when it's built
      this.refreshing = true;
      const next = this.load();
      this.ctx.waitUntil(
        next
          .then(() => ((this.engine = next), (this.at = Date.now())))
          .catch(() => {})
          .finally(() => (this.refreshing = false)),
      );
      return this.engine;
    }
    if (this.engine) return this.engine;
    const e = this.load();
    this.engine = e;
    this.at = Date.now();
    e.catch(() => {
      if (this.engine === e) this.engine = null;
    });
    return e;
  }

  async fetch(request: Request): Promise<Response> {
    const op = new URL(request.url).pathname.slice(1);
    const body = (request.method === "POST" ? await request.json().catch(() => ({})) : {}) as Record<string, unknown>;
    const blocked = new Set(Array.isArray(body.blocked) ? (body.blocked as string[]) : []);
    try {
      const e = await this.get();
      if (op === "built") return Response.json({ built: e.built, size: e.size });
      if (op === "rank") return Response.json(engineRank(e, String(body.q ?? ""), blocked, Number(body.limit) || 400, Number(body.snippets) || 0));
      if (op === "search") return Response.json(engineSearch(e, String(body.q ?? ""), (g) => !blocked.has(g)));
      if (op === "counts") return Response.json(engineCounts(e, Array.isArray(body.qs) ? (body.qs as unknown[]).map(String) : [], blocked, Number(body.limit) || 1));
      if (op === "docs") return Response.json(engineDocs(e, body, new Set()));
      if (op === "refresh") {
        this.at = 0;
        return Response.json({ ok: true });
      }
      return Response.json({ error: "unknown op" }, { status: 404 });
    } catch (err) {
      return Response.json({ error: (err as Error).message }, { status: 503 });
    }
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    // one engine for everyone: a single Durable Object instance
    return env.SEARCH_ENGINE.get(env.SEARCH_ENGINE.idFromName("engine-v1")).fetch(request);
  },
};
export default worker;
