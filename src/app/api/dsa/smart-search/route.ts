import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { callClaude, ownKey } from "@/lib/ai/client";
import { isAdminEmail } from "@/lib/ai/access";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getPracticeData } from "@/lib/dsa/practice-load";
import { buildTaxonomy, parseSmart, smartKey, smartSystem, SMART_SCHEMA, type LeanChoice, type SmartResponse, type Taxonomy } from "@/lib/dsa/search/smart";
import { getLeanIndex } from "@/lib/dsa/kinds-load";
import { ASK_RULES, ASK_SCHEMA_EXTRA, isQuestion, parseAsk, type AskLink } from "@/lib/dsa/search/ask";
import { searchDsa } from "@/lib/dsa/ai/search";
import { companyId, companyLabel } from "@/lib/dsa/problem-rows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };
/** the model gets this long; after it the page keeps its instant results */
const TIMEOUT_MS = 9_000;
/** a question also writes its answer: a little longer */
const ASK_TIMEOUT_MS = 14_000;
const ASK_TOKENS = 900;
/** identical normalised questions reuse the answer for this long: no second call */
const CACHE_MS = 24 * 3600_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; a: SmartResponse }>();

/** the taxonomy and the system prompt, rebuilt every few minutes (the page's data is itself ISR) */
let taxo: { at: number; t: Taxonomy; system: string; lessons: Record<string, string>; titles: Record<string, string> } | null = null;
async function taxonomy() {
  if (taxo && Date.now() - taxo.at < 10 * 60_000) return taxo;
  const [{ data }, lean] = await Promise.all([getPracticeData(), getLeanIndex().catch(() => [])]);
  const choices: LeanChoice[] = lean.map((l) => ({ key: `${l.module}/${l.id}`, title: l.title, kind: l.kind, ...(l.company ? { company: companyId(l.module.replace(/^co-/, "")) } : {}) }));
  const t = buildTaxonomy(data.rows, data.companies, data.concepts, data.lessons, choices, companyLabel);
  const lessons = { ...data.lessons, ...Object.fromEntries(lean.map((l) => [`${l.module}/${l.id}`, l.href])) };
  const titles = { ...data.concepts, ...Object.fromEntries(lean.map((l) => [`${l.module}/${l.id}`, l.title])) };
  taxo = { at: Date.now(), t, system: smartSystem(t), lessons, titles };
  return taxo;
}

/**
 * POST /api/dsa/smart-search { q } -> { filters, keywords, learnFirst?, note, learn? } for a signed-in learner: the Practice
 * tab's search box, asked for a sentence ("I want to learn sliding window, give me medium string problems") or when the
 * learner presses Enter / "Ask smart search". The model (Claude Haiku 4.5, feature "dsa-smart-search": metered, under the
 * budget governor, 60 a day each) sees only the query and a compact taxonomy, never the problem list, and answers in strict
 * JSON; only ids that exist are kept. The page ranks the problems itself with the instant engine. Identical normalised
 * questions are cached here for a day. Any failure is a plain error; the page keeps its instant results.
 */
export async function POST(request: Request) {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => ({}))) as { q?: unknown; answer?: unknown };
  const q = String(body.q ?? "").trim().slice(0, 200);
  const key = smartKey(q);
  // a question (same test as the page) also gets a written answer, in the same one call
  const wantAnswer = body.answer === true && isQuestion(q);
  if (key.length < 3) return NextResponse.json({ error: "Type a little more." }, { status: 400, headers: noStore });

  const tx = await taxonomy().catch(() => null);
  if (!tx) return NextResponse.json({ error: "Smart search is not ready. The instant results are complete." }, { status: 503, headers: noStore });
  const ck = `${tx.t.topics.length}.${tx.t.tags.length}.${tx.t.lessons.length}|${key}${wantAnswer ? "|a" : ""}`;
  const hit = cache.get(ck);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json({ ...hit.a, cached: true } satisfies SmartResponse, { headers: noStore });

  // Workers: a request must never await a promise another request created (it fails once that request ends), so a double
  // submit runs its own call (the box also ignores a second Enter while one is running).
  const job = (async () => {
      // the passages the answer may use: the tutor's retrieval (lessons and problem statements; no editorials)
      const found = wantAnswer ? await searchDsa({ query: q, unlocked: new Set(), limit: 5, budget: 5000 }).catch(() => null) : null;
      const passages = (found?.hits ?? []).map((h, i) => ({ tag: `s${i + 1}`, link: { kind: h.kind === "problem" ? "problem" : "lesson", title: h.title.split(" › ")[0].replace(/ lecture$/, ""), href: h.href } as AskLink, h }));
      const fallback: AskLink[] = [
        ...(found?.concepts ?? []).slice(0, 1).map((c) => ({ kind: "lesson" as const, title: c.title, href: c.href })),
        ...(found?.problems ?? []).slice(0, 1).map((c) => ({ kind: "problem" as const, title: c.title, href: c.href })),
      ];
      const content = wantAnswer ? `QUESTION: ${q}\n\nPASSAGES:\n${passages.map((p) => `[${p.tag}] ${p.h.title} (${p.h.kind})\n${p.h.text.slice(0, 1100)}`).join("\n\n") || "(none found)"}` : q;
      const schema = wantAnswer ? { ...SMART_SCHEMA, required: [...SMART_SCHEMA.required, "answer", "sources"], properties: { ...SMART_SCHEMA.properties, ...ASK_SCHEMA_EXTRA } } : SMART_SCHEMA;
      const r = await callClaude({
        feature: "dsa-smart-search",
        userId: me.id,
        adminPreview: await isAdminEmail(me.email),
        userKey: ownKey(request),
        system: wantAnswer ? tx.system + "\n" + ASK_RULES : tx.system,
        messages: [{ role: "user", content }],
        outputSchema: schema as unknown as Record<string, unknown>,
        timeoutMs: wantAnswer ? ASK_TIMEOUT_MS : TIMEOUT_MS,
        ...(wantAnswer ? { maxTokens: ASK_TOKENS, capChars: q.length } : {}),
        meta: { chars: q.length, ...(wantAnswer ? { answer: true, passages: passages.length } : {}) },
      });
      if (!r.ok) {
        const over = r.status === "over_quota" || r.status === "rate_limited";
        return { error: over ? "You've used today's smart searches. The instant results are all still here." : "Smart search is resting for a moment. The instant results are complete.", status: over ? 429 : 502 };
      }
      const a = parseSmart(r.text, tx.t);
      if (!a) return { error: "Smart search didn't understand that one. The instant results are complete.", status: 502 };
      const learn = a.learnFirst && tx.lessons[a.learnFirst] ? { id: a.learnFirst, title: tx.titles[a.learnFirst] || a.learnFirst, href: tx.lessons[a.learnFirst] } : undefined;
      const ask = wantAnswer ? parseAsk(r.text, passages, fallback) : undefined;
      const out: SmartResponse = { ...a, ...(learn ? { learn } : {}), ...(ask ? { ask } : {}) };
      cache.delete(ck);
      cache.set(ck, { at: Date.now(), a: out });
      while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
      return { a: out, left: r.creditsLeft };
    })();
  const out = await job;
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status, headers: noStore });
  return NextResponse.json({ ...out.a, cached: false, left: out.left } satisfies SmartResponse, { headers: noStore });
}
