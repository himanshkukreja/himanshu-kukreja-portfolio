import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, ownKey, saveTranscript } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { promptOptsFor, smartSearchSystem, stripPrivatePlan } from "@/lib/ai/prompts";
import { candidateLines, parseSmartAnswer, PER_FAMILY, smartSearchUser } from "@/lib/search/smart/ai";
import { SMART_SEARCH_PUBLIC } from "@/lib/search/smart/flag";
import { devPreview, getEngine, liveCheck, originOf } from "@/lib/search/smart/server";
import { queryKey } from "@/lib/search/smart/text";
import type { SmartAnswer } from "@/lib/search/smart/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** the model gets this long; after it the page keeps its deterministic results */
const TIMEOUT_MS = Number(process.env.SMART_SEARCH_TIMEOUT_MS) || 12_000;
/** identical queries (normalized) within this window reuse the answer: no second call, no credits */
const CACHE_MS = 6 * 3600_000;
const CACHE_MAX = 300;
type Cached = Omit<SmartAnswer, "cached" | "creditsLeft">;
const cache = new Map<string, { at: number; a: Cached }>();
const inflight = new Map<string, Promise<{ a: Cached } | { error: string; status: number; creditsLeft?: number | null }>>();

function remember(key: string, a: Cached) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), a });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
}

/**
 * POST /api/learn/ai/search { q } → a short direct answer citing candidates, and a learning path (3–7
 * steps), both from the same call and chosen only from the deterministic search's candidates, each step
 * and citation resolved against the index. Signed-in learners (admins only while
 * SMART_SEARCH_PUBLIC is false), metered as "smart-search". The request holds the query and the
 * candidates, nothing about the learner.
 */
export async function POST(request: Request) {
  // `next dev` only: the page's ?preview=1 tries the path without a session (metered, no user)
  const dev = devPreview(request);
  const me = dev ? { id: "", email: null } : await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const admin = dev || isAdminEmail(me.email);
  if (!SMART_SEARCH_PUBLIC && !admin) return NextResponse.json({ error: "Not available yet" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { q?: unknown };
  const q = String(body.q ?? "").trim().slice(0, 300);
  const key = queryKey(q);
  if (key.length < 3) return NextResponse.json({ error: "Ask a little more" }, { status: 400 });

  const [engine, live] = await Promise.all([getEngine(originOf(request)), liveCheck()]);
  const ck = `${engine.built}|${key}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json({ ...hit.a, cached: true } satisfies SmartAnswer, { headers: { "Cache-Control": "private, no-store" } });

  const res = engine.search(q, { live });
  if (!res.candidates.length) {
    const a: Cached = { intent: "", scope: "partial", note: "Nothing in the course matches this yet. Try other words, or a topic like caching, sharding or rate limiting.", answer: [], cites: [], path: [], quick: null };
    return NextResponse.json({ ...a, cached: false } satisfies SmartAnswer);
  }

  // one call per learner per query at a time (a double submit waits for the first)
  const fk = `${me.id || "dev"}|${ck}`;
  let job = inflight.get(fk);
  if (!job) {
    job = (async () => {
      const { text, ids, fam } = candidateLines(res.candidates, (d) => engine.family(d));
      const user = smartSearchUser(q, text);
      const r = await callClaude({
        feature: "smart-search",
        userId: me.id || null,
        adminPreview: admin,
        userKey: ownKey(request),
        // the model actually used (after admin settings and amber mode) picks the prompt: Haiku 5.5 gets its tuned one
        system: (model) => smartSearchSystem(promptOptsFor(model, "smart-search")),
        messages: [{ role: "user", content: user }],
        timeoutMs: TIMEOUT_MS,
        meta: { candidates: res.candidates.length, natural: res.natural },
      });
      if (!r.ok) return { error: r.message, status: r.status === "error" ? 502 : 429, creditsLeft: r.creditsLeft };
      // a goal that spans topics (an interview, a beginner's start) gets at most 2 steps per lesson family
      // Haiku 5.5's tuned prompt writes a private plan line before the JSON
      const answer = stripPrivatePlan(r.text);
      const p = parseSmartAnswer(answer, ids, fam, res.intents.includes("interview") || res.intents.includes("beginner") ? 2 : PER_FAMILY);
      await saveTranscript(r.callId, me.id || null, "smart-search", q, answer);
      if (!p.ok) return { error: "The learning path didn't come out right. The results below are complete.", status: 502, creditsLeft: r.creditsLeft };
      if (p.answer.scope !== "off_topic" && !p.answer.path.length) return { error: "No learning path this time. The results below are complete.", status: 502, creditsLeft: r.creditsLeft };
      remember(ck, p.answer);
      return { a: p.answer, creditsLeft: r.creditsLeft };
    })().finally(() => inflight.delete(fk));
    inflight.set(fk, job);
  }
  const out = await job;
  if ("error" in out) return NextResponse.json({ error: out.error, creditsLeft: out.creditsLeft ?? null }, { status: out.status });
  return NextResponse.json({ ...out.a, cached: false, creditsLeft: (out as { creditsLeft?: number | null }).creditsLeft ?? null } satisfies SmartAnswer, { headers: { "Cache-Control": "private, no-store" } });
}
