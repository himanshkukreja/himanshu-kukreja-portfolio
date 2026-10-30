import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { featureConfig, getAiSettings } from "@/lib/ai/settings";
import { FEATURES } from "@/lib/ai/features";
import { conversations, readConvQuery } from "@/lib/admin/chatConversations";

export const dynamic = "force-dynamic";

type Row = { id: number; created_at: string; user_id: string | null; feature: string; model: string; status: string; cost_usd: number | null; latency_ms: number | null; meta: Record<string, unknown> | null };
const REFUSED = new Set(["over_quota", "rate_limited", "blocked", "disabled", "too_long"]);

/**
 * GET /api/admin/ai/chat?days=14 → the course chat at a glance, from ai_calls (feature "course-chat", one row per
 * message, plus "chat-memory" and "chat-title"): messages and learners per day, Sonnet vs fast-mode share, cost, tools per message,
 * latency, declined / off-topic / failed counts, top topics (the course's own titles, never learner text), saved
 * paths and quizzes. Plus the chat's settings (switch, Sonnet messages a day, ceiling).
 * GET ?view=conversations&days=14&sort=&user=&mode=&outcome=&page= → one page of the window's conversations, filtered
 * and sorted on the server (lib/admin/chatConversations.ts).
 * GET ?chat=<id> → that conversation's messages with their transcripts (kept 30 days, admins only).
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const p = new URL(request.url).searchParams;

  // thumbs-down and "this was wrong" answers as chat eval cases (scripts/ai-eval/chat-cases.ts format)
  if (p.get("export") === "feedback") {
    const { data, error } = await supabase.from("chat_feedback").select("call_id, rating, wrong, note, created_at").or("rating.eq.-1,wrong.eq.true").order("created_at", { ascending: false }).limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = (data ?? []) as { call_id: number; rating: number; wrong: boolean; note: string | null; created_at: string }[];
    const tr = rows.length ? await supabase.from("ai_transcripts").select("call_id, input, output").in("call_id", rows.map((r) => r.call_id)) : { data: [] };
    const byId = new Map(((tr.data ?? []) as { call_id: number; input: string; output: string | null }[]).map((t) => [t.call_id, t]));
    const cases = rows
      .filter((r) => byId.has(r.call_id))
      .map((r) => {
        const t = byId.get(r.call_id)!;
        const answer = (t.output || "").split("\n\n— tools:")[0];
        return {
          id: `fb-${r.call_id}`,
          feature: "course-chat",
          title: `Learner feedback (${r.wrong ? "marked wrong" : "thumbs down"}, ${r.created_at.slice(0, 10)})${r.note ? `: ${r.note.slice(0, 80)}` : ""}`,
          turns: [{ user: t.input, expect: [r.note ? `Fixes what the learner said was wrong: ${r.note}` : "A correct, cited answer to the learner's question"], mustNot: [`Repeat the answer the learner rejected: "${answer.slice(0, 300)}"`] }],
        };
      });
    return new NextResponse(JSON.stringify(cases, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="chat-feedback-cases-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } });
  }

  if (p.get("view") === "conversations") {
    try {
      return NextResponse.json(await conversations(readConvQuery(p)), { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
    }
  }

  const chatId = p.get("chat");
  if (chatId) {
    if (!/^[a-z0-9]{6,40}$/i.test(chatId)) return NextResponse.json({ error: "bad chat id" }, { status: 400 });
    const { data, error } = await supabase.from("ai_calls").select("id, created_at, model, status, cost_usd, latency_ms, meta").eq("feature", "course-chat").eq("meta->>chat", chatId).order("created_at", { ascending: true }).limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const ids = (data ?? []).map((r) => r.id as number);
    const tr = ids.length ? await supabase.from("ai_transcripts").select("call_id, input, output").in("call_id", ids) : { data: [] };
    const byId = new Map(((tr.data ?? []) as { call_id: number; input: string; output: string | null }[]).map((t) => [t.call_id, t]));
    return NextResponse.json({ messages: (data ?? []).map((r) => ({ ...r, transcript: byId.get(r.id as number) ?? null })) }, { headers: { "Cache-Control": "no-store" } });
  }

  const days = Math.min(90, Math.max(1, Number(p.get("days")) || 14));
  const since = new Date(Date.now() - days * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const rows: Row[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await supabase
      .from("ai_calls")
      .select("id, created_at, user_id, feature, model, status, cost_usd, latency_ms, meta")
      .in("feature", ["course-chat", "chat-memory", "chat-title"])
      .gte("created_at", since.toISOString())
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }

  type Day = { day: string; messages: number; users: Set<string>; sonnet: number; fast: number; cost: number; memoryCost: number; titleCost: number; tools: number; latency: number; offTopic: number; refused: number; errors: number };
  const byDay = new Map<string, Day>();
  const dayOf = (d: string) => d.slice(0, 10);
  for (let t = since.getTime(); t <= Date.now(); t += 86_400_000) {
    const k = new Date(t).toISOString().slice(0, 10);
    byDay.set(k, { day: k, messages: 0, users: new Set(), sonnet: 0, fast: 0, cost: 0, memoryCost: 0, titleCost: 0, tools: 0, latency: 0, offTopic: 0, refused: 0, errors: 0 });
  }
  const topics = new Map<string, number>();
  const toolUse = new Map<string, number>();
  const lat: number[] = [];
  const allUsers = new Set<string>();
  let quizzes = 0;
  let graded = 0;
  let paths = 0;
  let saved = 0;
  let rounds = 0;
  let answered = 0;
  for (const r of rows) {
    const d = byDay.get(dayOf(r.created_at));
    if (!d) continue;
    const m = r.meta ?? {};
    if (r.feature === "chat-memory") {
      if (r.status === "ok") d.memoryCost += Number(r.cost_usd) || 0;
      continue;
    }
    if (r.feature === "chat-title") {
      d.titleCost += Number(r.cost_usd) || 0;
      continue;
    }
    if (REFUSED.has(r.status)) {
      d.refused++;
      continue;
    }
    if (r.status === "error") {
      d.errors++;
      continue;
    }
    // ok and off_topic are answered messages
    answered++;
    d.messages++;
    if (r.user_id) {
      d.users.add(r.user_id);
      allUsers.add(r.user_id);
    }
    if (/haiku/.test(r.model)) d.fast++;
    else d.sonnet++;
    d.cost += Number(r.cost_usd) || 0;
    d.tools += Number(m.tools) || 0;
    d.latency += Number(r.latency_ms) || 0;
    if (r.latency_ms) lat.push(r.latency_ms);
    if (r.status === "off_topic") d.offTopic++;
    rounds += Number(m.rounds) || 0;
    if (m.quiz) quizzes++;
    if (m.graded) graded++;
    if (m.path) paths++;
    if (m.saved) saved++;
    if (typeof m.topic === "string" && m.topic) topics.set(m.topic, (topics.get(m.topic) ?? 0) + 1);
    for (const t of String(m.toolNames || "").split(",").filter(Boolean)) toolUse.set(t, (toolUse.get(t) ?? 0) + 1);
  }
  lat.sort((a, b) => a - b);
  const pct = (q: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] : null);
  const daily = [...byDay.values()].map((d) => ({
    day: d.day,
    messages: d.messages,
    users: d.users.size,
    sonnet: d.sonnet,
    fast: d.fast,
    cost: d.cost,
    memoryCost: d.memoryCost,
    titleCost: d.titleCost,
    avgTools: d.messages ? d.tools / d.messages : 0,
    avgLatency: d.messages ? d.latency / d.messages : 0,
    offTopic: d.offTopic,
    refused: d.refused,
    errors: d.errors,
  }));
  const sum = (k: keyof (typeof daily)[number]) => daily.reduce((a, d) => a + (Number(d[k]) || 0), 0);

  const mem = await supabase.from("chat_memory").select("user_id", { count: "exact", head: true });
  // answer feedback in the window: the rate, and the worst answers (thumbs down or "wrong") with their text
  const fb = await supabase.from("chat_feedback").select("call_id, rating, wrong, note, created_at").gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(2000);
  const fbRows = fb.error ? null : ((fb.data ?? []) as { call_id: number; rating: number; wrong: boolean; note: string | null; created_at: string }[]);
  const worstRows = (fbRows ?? []).filter((r) => r.rating < 0 || r.wrong).slice(0, 15);
  const worstTr = worstRows.length ? await supabase.from("ai_transcripts").select("call_id, input, output").in("call_id", worstRows.map((r) => r.call_id)) : { data: [] };
  const trById = new Map(((worstTr.data ?? []) as { call_id: number; input: string; output: string | null }[]).map((t) => [t.call_id, t]));
  const feedback = fbRows
    ? {
        up: fbRows.filter((r) => r.rating > 0).length,
        down: fbRows.filter((r) => r.rating < 0).length,
        wrong: fbRows.filter((r) => r.wrong).length,
        worst: worstRows.map((r) => ({ callId: r.call_id, at: r.created_at, rating: r.rating, wrong: r.wrong, note: r.note, question: trById.get(r.call_id)?.input?.slice(0, 400) ?? null, answer: trById.get(r.call_id)?.output?.split("\n\n— tools:")[0].slice(0, 800) ?? null })),
      }
    : null;
  // the content-gap radar's raw material: searches that found no lesson (the tutor's phrases, never learner text)
  const gaps = new Map<string, number>();
  for (const r of rows) for (const x of ((r.meta?.searches as { q: string; gap: boolean }[] | undefined) ?? [])) if (x?.gap && typeof x.q === "string") gaps.set(x.q.toLowerCase(), (gaps.get(x.q.toLowerCase()) ?? 0) + 1);

  const s = await getAiSettings(true);
  const cfg = featureConfig(s, "course-chat");
  return NextResponse.json(
    {
      settings: { masterOn: s.enabled, enabled: cfg.enabled, perDay: cfg.perDay, ceiling: cfg.ceiling || FEATURES["course-chat"].ceiling || 300, model: cfg.model, features: s.features },
      days,
      daily,
      totals: {
        messages: answered,
        users: allUsers.size,
        sonnet: sum("sonnet"),
        fast: sum("fast"),
        cost: sum("cost"),
        memoryCost: sum("memoryCost"),
        titleCost: sum("titleCost"),
        offTopic: sum("offTopic"),
        refused: sum("refused"),
        errors: sum("errors"),
        avgTools: answered ? daily.reduce((a, d) => a + d.avgTools * d.messages, 0) / answered : 0,
        avgRounds: answered ? rounds / answered : 0,
        p50: pct(0.5),
        p95: pct(0.95),
        quizzes,
        graded,
        paths,
        saved,
        memoryUsers: mem.error ? null : mem.count ?? 0,
      },
      topics: [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([topic, n]) => ({ topic, n })),
      tools: [...toolUse.entries()].sort((a, b) => b[1] - a[1]).map(([tool, n]) => ({ tool, n })),
      feedback,
      gaps: [...gaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([q, n]) => ({ q, n })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
