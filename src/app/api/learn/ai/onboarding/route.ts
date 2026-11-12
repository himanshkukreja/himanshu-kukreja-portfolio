import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { isAdminEmail } from "@/lib/ai/access";
import { callClaude, ownKey } from "@/lib/ai/client";
import { supabase } from "@/lib/supabase";
import { COURSE_ID } from "@/lib/learn/course";
import { loadMemory, saveMemory } from "@/lib/ai/chat/server";
import { applyOnboarding, srcKey, type ChatMemory } from "@/lib/ai/chat/memory-model";
import { closingLine, goalChatInput, goalChatSystem, GOAL_CHAT_MAX_TURNS, GOAL_CHAT_SCHEMA, wantsToStop, hasNotes, profileNotes, readGoalReply, readProfile, readTurns, withKnown, type GoalCourse, type GoalKnown, type GoalProfile } from "@/lib/learner/goal-chat-model";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };

/**
 * The goal chat (lib/learner/goal-chat-model.ts), for the signed-in learner:
 *   GET   → { available, paused, eligible, onboarded } · eligible: memory is on and holds no goals or level yet (the
 *           chat's first-visit nudge shows then); onboarded: notes from an earlier goal chat exist
 *   POST  { turns, client? } → { reply, chips, done, profile, saved? }: the next line of the chat (turns: [] opens it).
 *           When the chat is done, what it captured is written to memory (goals, level, prefs; provenance "onboarding")
 *           and `saved` lists the notes, for the page's summary.
 *   POST  { finish: { profile }, client? } → { saved }: "Save and finish" before the chat ended: the last profile the
 *           page got, checked again, is written the same way (no AI call).
 * Memory off or unavailable: 409 / 503, nothing is asked or written (the chat exists only to fill memory). The learner's
 * words go to Anthropic for the reply (the site's AI note) and are not kept: no transcript is saved for this feature, and
 * the metering row holds only counts. client: what this device knows from DSA Mastery (its welcome's experience and goal,
 * "Show everything"), so the chat doesn't ask again.
 */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const m = await loadMemory(me.id);
  const onboarded = Object.values(m.memory.src ?? {}).some((s) => s.by === "onboarding");
  const eligible = m.available && !m.paused && !m.memory.goals.length && !m.memory.level;
  return NextResponse.json({ available: m.available, paused: m.paused, eligible, onboarded }, { headers: noStore });
}

/** What the site knows already: memory's shared lines, DSA's onboarding flag and welcome, and the courses started. */
async function knownFor(userId: string, mem: ChatMemory, client: unknown): Promise<GoalKnown> {
  const c = client && typeof client === "object" ? (client as Record<string, unknown>) : {};
  const [prof, sdm] = await Promise.all([
    supabase.from("user_profiles").select("game_done, game_flags").eq("id", userId).maybeSingle(),
    supabase.from("learning_progress").select("lesson_slug").eq("user_id", userId).eq("course_id", COURSE_ID).limit(1),
  ]);
  const p = (prof.data ?? {}) as { game_done?: Record<string, unknown> | null; game_flags?: Record<string, unknown> | null };
  const onb = (p.game_flags?.["pref:dsa-onboarding"] ?? null) as { status?: unknown; exp?: unknown; pace?: { goal?: unknown } } | null;
  const done = Object.keys(p.game_done ?? {});
  const pick = (...xs: unknown[]) => (xs.find((x) => typeof x === "string" && /^[a-z]{2,16}$/.test(x)) as string | undefined) ?? null;
  const started: GoalCourse[] = [];
  if ((sdm.data ?? []).length || done.some((k) => /^(lesson|stage|trial|lab|mock):/.test(k))) started.push("sdm");
  if (done.some((k) => k.startsWith("dsa:"))) started.push("dsa");
  return {
    goals: mem.goals,
    level: mem.level,
    prefs: mem.prefs,
    dsaExp: pick(c.exp, onb?.exp),
    dsaGoal: pick(c.goal, onb?.pace?.goal),
    dsaFull: c.full === true,
    started,
  };
}

/** The profile written to memory; the notes it made (for the page's summary). */
async function save(userId: string, profile: GoalProfile, known: GoalKnown): Promise<{ ok: boolean; saved: { goals: string[]; level: string; prefs: string[] } }> {
  const notes = profileNotes(withKnown(profile, known));
  if (!hasNotes(notes)) return { ok: true, saved: { goals: [], level: "", prefs: [] } };
  // read again just before writing (a tutor may have written meanwhile) and never while memory is off
  const now = await loadMemory(userId);
  if (!now.available || now.paused) return { ok: false, saved: { goals: [], level: "", prefs: [] } };
  const next = applyOnboarding(now.memory, notes, new Date());
  const ok = await saveMemory(userId, next);
  // what was actually kept, by its provenance (the scrub and caps may have changed the words)
  const mine = (f: "goals" | "prefs", xs: string[]) => xs.filter((x) => next.src[srcKey(f, x)]?.by === "onboarding");
  return { ok, saved: { goals: mine("goals", next.goals), level: next.src[srcKey("level", next.level)]?.by === "onboarding" ? next.level : "", prefs: mine("prefs", next.prefs) } };
}

export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const body = (await request.json().catch(() => null)) as { turns?: unknown; client?: unknown; finish?: { profile?: unknown } } | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: noStore });
  const m = await loadMemory(me.id);
  if (!m.available) return NextResponse.json({ error: "Memory isn't available yet." }, { status: 503, headers: noStore });
  if (m.paused) return NextResponse.json({ error: "Memory is off, so there's nowhere to keep your goals. Turn it on under You → What the AI knows." }, { status: 409, headers: noStore });
  const known = await knownFor(me.id, m.memory, body.client);

  if (body.finish && typeof body.finish === "object") {
    const r = await save(me.id, readProfile(body.finish.profile), known);
    return NextResponse.json({ saved: r.saved }, { status: r.ok ? 200 : 500, headers: noStore });
  }

  const turns = readTurns(body.turns);
  if (!turns) return NextResponse.json({ error: "That's the end of this chat: save what we have." }, { status: 400, headers: noStore });
  const users = turns.filter((t) => t.role === "user").length;
  const r = await callClaude({
    feature: "goal-chat",
    userId: me.id,
    adminPreview: await isAdminEmail(me.email),
    userKey: ownKey(request),
    system: goalChatSystem(),
    messages: [{ role: "user", content: goalChatInput(turns, known) }],
    outputSchema: GOAL_CHAT_SCHEMA as unknown as Record<string, unknown>,
    // only the learner's own words count toward the cap (the replies and what's known are the route's)
    capChars: turns.filter((t) => t.role === "user").reduce((a, t) => a + t.text.length, 0),
    timeoutMs: 20_000,
    meta: { turn: users, known: !!(known.goals.length || known.level || known.dsaExp) },
  });
  if (!r.ok) return NextResponse.json({ error: r.message, creditsLeft: r.creditsLeft }, { status: r.status === "error" ? 502 : 429, headers: noStore });
  const reply = readGoalReply(r.text);
  if (!reply) return NextResponse.json({ error: "The goal chat didn't answer this time. Try again, or skip it for now." }, { status: 502, headers: noStore });
  // the learner's sixth answer, or asking to stop, always ends it
  const lastUser = [...turns].reverse().find((t) => t.role === "user")?.text ?? "";
  const done = reply.done || users >= GOAL_CHAT_MAX_TURNS || (users > 0 && wantsToStop(lastUser));
  const profile = withKnown(reply.profile, known);
  if (!done) return NextResponse.json({ reply: reply.reply, chips: reply.chips, done, profile, creditsLeft: r.creditsLeft }, { headers: noStore });
  const s = await save(me.id, profile, known);
  return NextResponse.json({ reply: closingLine(reply.reply), chips: [], done, profile, saved: s.saved, creditsLeft: r.creditsLeft }, { status: s.ok ? 200 : 500, headers: noStore });
}
