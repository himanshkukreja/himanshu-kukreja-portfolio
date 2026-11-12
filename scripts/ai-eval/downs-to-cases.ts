/**
 * Recent thumbs-down answers → draft eval cases, for review (AI quality layer, 12 Nov 2026). Reads chat_feedback (the
 * downs and their reasons), the answers' metering rows (feature, model, prompt version, the chat's topic and page) and,
 * from ai_transcripts, an excerpt of the AI's own answer (the "must not repeat" line). Each draft says what the next
 * answer must do from the reason (wrong → correct facts; not grounded → cited and supported; too long → short; gave away
 * → coaches without the solution; didn't know me → uses the learner's context).
 *
 * The learner's own question is NOT copied by default: the draft carries the topic, the page and the feature, and a
 * TODO for the reviewer to write a synthetic question on it. `--with-questions` adds the learner's message from the
 * transcript (emails, phone numbers and links scrubbed) to help write that question; the drafts folder is gitignored, and
 * a case is committed (to chat-cases.ts, dsa-chat-cases.ts, …) only once it is rewritten in the reviewer's own words.
 *
 *   npx tsx --env-file=.env.local scripts/ai-eval/downs-to-cases.ts [--days 14] [--limit 50] [--feature course-chat]
 *     [--with-questions] [--out scripts/ai-eval/drafts]
 * Reads only (the service role, like the admin); writes one JSON file. No model calls.
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { FEEDBACK_REASONS, isFeedbackFeature, reasonOf, type FeedbackReason } from "../../src/lib/ai/feedback-model";
import { answerExcerpt } from "../../src/lib/admin/aiQuality-model";

const arg = (k: string, d: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : d;
};
const DAYS = Math.max(1, Math.min(90, Number(arg("days", "14")) || 14));
const LIMIT = Math.max(1, Math.min(500, Number(arg("limit", "50")) || 50));
const ONLY = arg("feature", "");
const WITH_Q = process.argv.includes("--with-questions");
const OUT = path.resolve(arg("out", "scripts/ai-eval/drafts"));

/** what the next answer must do, by the reason the learner picked */
export const EXPECT: Record<FeedbackReason | "none", string[]> = {
  wrong: ["Every fact, number, trace and line reference is correct (the rejected answer was marked wrong: check it against the course)"],
  not_grounded: ["Course claims are cited with refs whose source supports the sentence; when the course has no lesson on it, says so first"],
  too_long: ["The direct answer first, in under ~150 words (a quick question: under ~80); no padding or repeated recap"],
  gave_away: ["Coaches toward the answer (a question, the next step, the exact spot) without the full solution, full code or the approach while it is locked"],
  didnt_know_me: ["Uses what the learner's context says (their progress, level, earlier results, goals) where it changes the answer, and says when it doesn't know"],
  none: ["A correct, grounded, appropriately short answer to the learner's question"],
};

/** emails, phone numbers and links out of a learner message (only with --with-questions, for the reviewer's eyes) */
export const scrub = (s: string) =>
  s
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[number]")
    .replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "[link]")
    .slice(0, 1200);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed (--env-file=.env.local)");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();
  let fb = await db.from("chat_feedback").select("call_id, created_at, rating, wrong, note, reason, feature, model, prompt_hash").eq("rating", -1).gte("created_at", since).order("created_at", { ascending: false }).limit(LIMIT * 2);
  if (fb.error) fb = (await db.from("chat_feedback").select("call_id, created_at, rating, wrong, note").eq("rating", -1).gte("created_at", since).order("created_at", { ascending: false }).limit(LIMIT * 2)) as typeof fb;
  if (fb.error) throw new Error(fb.error.message);
  const rows = (fb.data ?? []) as { call_id: number; created_at: string; rating: number; wrong: boolean; note: string | null; reason?: string | null; feature?: string | null; model?: string | null; prompt_hash?: string | null }[];
  if (!rows.length) {
    console.log(`no thumbs-down answers in the last ${DAYS} days`);
    return;
  }
  const ids = rows.map((r) => r.call_id);
  const calls = await db.from("ai_calls").select("id, feature, model, meta").in("id", ids);
  const byId = new Map(((calls.data ?? []) as { id: number; feature: string; model: string; meta: Record<string, unknown> | null }[]).map((c) => [c.id, c]));
  const tr = await db.from("ai_transcripts").select(WITH_Q ? "call_id, input, output" : "call_id, output").in("call_id", ids);
  const trOf = new Map(((tr.data ?? []) as unknown as { call_id: number; input?: string; output: string | null }[]).map((t) => [t.call_id, t]));

  const drafts = rows
    .map((r) => {
      const call = byId.get(r.call_id);
      const feature = r.feature || call?.feature || "";
      if (!isFeedbackFeature(feature) || (ONLY && feature !== ONLY)) return null;
      const reason = reasonOf(r);
      const m = call?.meta ?? {};
      const t = trOf.get(r.call_id);
      const answer = t ? answerExcerpt(t.output, 400) : "";
      // what the question was about, in the course's own words (never the learner's)
      const about = [m.topic && `topic "${m.topic}"`, m.page && `asked on ${m.page}`, m.problem && `problem ${m.problem}`, m.mode && `mode ${m.mode}`, m.lang && `in ${m.lang}`, m.toolNames && `tools ${m.toolNames}`].filter(Boolean).join(", ");
      return {
        id: `fb-${feature}-${r.call_id}`,
        feature,
        draft: true,
        source: { callId: r.call_id, at: r.created_at, reason: reason ? FEEDBACK_REASONS[reason] : null, model: r.model || call?.model || null, pv: r.prompt_hash || (m.pv as string | undefined) || null },
        title: `Learner 👎${reason ? ` (${FEEDBACK_REASONS[reason].toLowerCase()})` : ""} on ${feature}${about ? `: ${about}` : ""}`,
        turns: [
          {
            user: "TODO: write a synthetic question on this topic in your own words (never paste the learner's message into a committed case)",
            ...(WITH_Q && t?.input ? { learnerQuestionForReviewOnly: scrub(t.input) } : {}),
            expect: EXPECT[reason ?? "none"],
            mustNot: answer ? [`Repeat the answer the learner rejected: "${answer}"`] : [],
          },
        ],
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, LIMIT);

  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `downs-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify(drafts, null, 2));
  const by = new Map<string, number>();
  for (const d of drafts) by.set(d.feature, (by.get(d.feature) ?? 0) + 1);
  console.log(`${drafts.length} draft cases (${[...by].map(([f, n]) => `${f} ${n}`).join(", ")}) → ${file}`);
  console.log("Review each, write the question in your own words, and move it into the feature's cases file.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
