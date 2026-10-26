/**
 * One-time content job: "Learners often ask here" for every chapter (scene) of each side-quest
 * lecture, written by Opus from the lecture script, its side quest and design sheet through the
 * Message Batches API (half price). One request per lecture.
 * Output: <content repo>/resources/lecture-faq/<quest slug>.json, read by src/lib/learn/lecture/faq.ts
 * and shown free in the lecture player. Every result is logged in ai_calls (feature "batch",
 * batch=true) so /admin/ai shows the spend.
 *
 * usage:
 *   NODE_PATH=<server-only stub> npx tsx --env-file=.env --env-file=.env.local scripts/ai-batch/lecture-faq.ts submit [--only slug[,slug]] [--force] [--dry] [--wait]
 *   ... lecture-faq.ts poll <batch id>      (waits until done, then writes files and logs costs)
 * Refuses to submit when the estimate is over MAX_USD. State (batch id → lecture slugs) is kept in
 * scripts/ai-batch/.state/ (git-ignored).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { supabase } from "@/lib/supabase";
import { costOf, creditsFor, MODELS, type Usage } from "@/lib/ai/prices";
import type { Lecture, LectureScene } from "@/lib/learn/lecture/types";

const CONTENT = process.env.SDM_LOCAL_DIR || path.resolve(process.cwd(), "..", "system-design-mastery");
const RES = path.join(CONTENT, "resources");
// a phase staged for release: LECTURES_DIR=resources/lectures-next FAQ_DIR=resources/lecture-faq-next
const LECTURES = process.env.LECTURES_DIR || path.join(RES, "lectures");
const OUT = process.env.FAQ_DIR || path.join(RES, "lecture-faq");
const STATE = path.join(process.cwd(), "scripts/ai-batch/.state");
const MODEL = MODELS.opus;
const MAX_TOKENS = 20000;
const MAX_USD = 6;
const API = "https://api.anthropic.com/v1/messages/batches";
const H = { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" };

const SYSTEM = `You write the "Learners often ask here" questions for one interactive system design lecture. The lecture is split into chapters (scenes); the player shows a few questions with ready answers next to the chapter the learner has paused on.

You get the written lesson the lecture teaches (a side quest with its design sheet, or a course lesson), and the lecture script, scene by scene with each scene's id.

For every scene listed under "Write FAQs for", write 2 or 3 questions a learner pausing at that chapter would really ask: what confuses people there, "why not just X?", "what if Y fails?", how it connects to an earlier chapter. Make them specific to that chapter, not generic, and don't repeat a question across chapters. For the scenes listed under "At most one", write 1 question or none. Write nothing for checkpoint (quiz) scenes.

Answers:
- under 90 words, plain friendly English, talking to the learner ("you"); Markdown (bold, short lists, inline code) is fine, but no headings;
- strictly from the lecture script and the written lesson (and design sheet, if given): no outside facts, numbers, products or claims that aren't in them. If the sources don't answer a question, choose another question;
- never give away a checkpoint: an FAQ for a scene that comes before a checkpoint must not answer that checkpoint's question, hint at its correct option or rule its options in or out. Ask about something else there.

Reply with strict JSON only, nothing before or after, no code fences:
{"scenes":{"<scene id>":[{"q":"<question>","a":"<answer>"}]}}`;

type Item = { q: string; a: string };
type Job = { slug: string; title: string; hash: string; teach: string[]; light: string[]; prompt: string };

/** last two list scenes are the recap and the interview lines: at most one question each */
function sceneRoles(l: Lecture) {
  const tail = new Set(l.scenes.slice(-2).filter((s) => s.kind === "list").map((s) => s.id));
  return {
    teach: l.scenes.filter((s) => s.kind !== "quiz" && !tail.has(s.id)).map((s) => s.id),
    light: l.scenes.filter((s) => tail.has(s.id)).map((s) => s.id),
  };
}

function sceneText(s: LectureScene, i: number): string {
  const head = `## Scene ${i + 1} · id "${s.id}" · ${s.kind} · ${s.title}`;
  if (s.kind === "quiz") {
    const opts = (s.options ?? []).map((o, k) => `  ${k + 1}. ${o}`).join("\n");
    return `${head} (CHECKPOINT, no FAQ)\nQuestion: ${s.question}\nOptions:\n${opts}\nCorrect: option ${(s.answer ?? 0) + 1}\nWhy: ${s.explain}`;
  }
  const out = [head];
  if (s.heading) out.push(`Heading: ${s.heading}`);
  if (s.numbers) out.push(`Numbers: ${s.numbers.map((n) => `${n.value} (${n.label})`).join("; ")}`);
  if (s.points) out.push(`On screen: ${s.points.map((p) => (typeof p === "string" ? p : `${p.label}: ${p.value}${s.unit ? ` ${s.unit}` : ""}`)).join(" | ")}`);
  if (s.left && s.right) out.push(`Left "${s.left.title}": ${s.left.points.join(" | ")}\nRight "${s.right.title}": ${s.right.points.join(" | ")}`);
  if (s.events) out.push(`Events: ${s.events.map((e) => `${e.at}: ${e.text}`).join(" | ")}`);
  if (s.screens) out.push(`Phone (${s.app}): ${s.screens.map((sc) => `[${sc.title}] ${sc.rows.map((r) => r.text + (r.meta ? ` (${r.meta})` : "")).join("; ")}${sc.toast ? ` / toast: ${sc.toast}` : ""}`).join(" ")}`);
  if (s.diagram) out.push(`Diagram:\n${s.diagram}`);
  out.push(`Narration: ${s.steps.map((st) => st.say).join(" ")}`);
  return out.join("\n");
}

const read = (f: string) => (fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "");

function jobs(): Job[] {
  return fs
    .readdirSync(LECTURES)
    .filter((f) => f.endsWith(".json") && f !== "lesson-index.json")
    .sort()
    .map((f) => {
      const slug = f.replace(/\.json$/, "");
      const l = JSON.parse(fs.readFileSync(path.join(LECTURES, f), "utf8")) as Lecture;
      if (!Array.isArray(l.scenes)) return null;
      const hash = crypto.createHash("sha1").update(JSON.stringify(l)).digest("hex").slice(0, 12);
      const { teach, light } = sceneRoles(l);
      const source = l.lesson
        ? [`<lesson>\n${read(path.join(RES, l.lesson.week, `${l.lesson.slug}.md`))}\n</lesson>`]
        : [`<side_quest>\n${read(path.join(RES, "bonus-problems", `${slug}.md`))}\n</side_quest>`, `<design_sheet>\n${read(path.join(RES, "design-sheets", `${slug}.md`)) || "(none)"}\n</design_sheet>`];
      const prompt = [
        ...source,
        `<lecture title="${l.title}">\nSummary: ${l.summary}\n\n${l.scenes.map(sceneText).join("\n\n")}\n</lecture>`,
        `Write FAQs for (2 or 3 each): ${teach.join(", ")}\nAt most one: ${light.join(", ") || "(none)"}\nNo FAQ (checkpoints): ${l.scenes.filter((s) => s.kind === "quiz").map((s) => s.id).join(", ") || "(none)"}`,
      ].join("\n\n");
      return { slug, title: l.title, hash, teach, light, prompt };
    })
    .filter((j): j is Job => !!j);
}

const outFile = (slug: string) => path.join(OUT, `${slug}.json`);
/** current source hash and every teaching scene answered; otherwise the next run replaces it */
function upToDate(j: Job) {
  try {
    const f = JSON.parse(read(outFile(j.slug))) as { source?: string; scenes?: Record<string, Item[]> };
    return f.source === j.hash && j.teach.every((id) => (f.scenes?.[id]?.length ?? 0) > 0);
  } catch {
    return false;
  }
}

/** A cut-off reply: keep everything up to the last complete {"q","a"} object and close the JSON. */
function salvage(text: string): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  let cut = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (c === "}" && depth === 3) cut = i; // root{ scenes{ id:[ {q,a} ← closed
    }
  }
  return cut < 0 ? null : `${text.slice(0, cut + 1)}]}}`;
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const clean = (s: string) => s.replace(/^\s{0,3}#{1,6}\s+/gm, "").trim();

/** Keep only known scenes (in lecture order) and well-formed {q, a} items; cap per scene. */
function validate(j: Job, raw: unknown): { scenes: Record<string, Item[]>; dropped: string[] } {
  const src = (raw && typeof raw === "object" && "scenes" in raw ? (raw as { scenes: unknown }).scenes : raw) as Record<string, unknown> | null;
  const scenes: Record<string, Item[]> = {};
  const dropped: string[] = [];
  if (!src || typeof src !== "object") return { scenes, dropped };
  for (const id of Object.keys(src)) if (!j.teach.includes(id) && !j.light.includes(id)) dropped.push(id);
  for (const id of [...j.teach, ...j.light]) {
    const list = src[id];
    if (!Array.isArray(list)) continue;
    const items = list
      .filter((x): x is Item => !!x && typeof x === "object" && typeof (x as Item).q === "string" && typeof (x as Item).a === "string")
      .map((x) => ({ q: clean(x.q), a: clean(x.a) }))
      .filter((x) => x.q && x.a && words(x.a) <= 130)
      .slice(0, j.light.includes(id) ? 1 : 3);
    if (items.length) scenes[id] = items;
  }
  return { scenes, dropped };
}

async function submit(only: string[] | null, force: boolean, dry: boolean) {
  const all = jobs().filter((j) => (!only || only.includes(j.slug)) && (force || !upToDate(j)));
  if (!all.length) return console.log("nothing to do: every lecture FAQ is up to date");
  const estimate = all.reduce(
    (a, j) => a + costOf(MODEL, { input_tokens: Math.round((j.prompt.length + SYSTEM.length) / 3.4), output_tokens: j.teach.length * 3 * 130 + 400 }, true),
    0,
  );
  console.log(`${all.length} lectures · estimated ~$${estimate.toFixed(2)} (batch price, Opus)`);
  if (estimate > MAX_USD) {
    console.log(`not submitting: estimate is over the $${MAX_USD} cap`);
    return;
  }
  if (dry) return console.log("dry run: not submitted");
  const requests = all.map((j, i) => ({
    custom_id: `lfaq-${i}`,
    params: { model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, messages: [{ role: "user", content: j.prompt }] },
  }));
  const r = await fetch(API, { method: "POST", headers: H, body: JSON.stringify({ requests }) });
  const b = (await r.json()) as { id?: string; error?: { message?: string } };
  if (!r.ok || !b.id) throw new Error(b.error?.message || `HTTP ${r.status}`);
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(path.join(STATE, `${b.id}.json`), JSON.stringify(all.map((j, i) => ({ id: `lfaq-${i}`, slug: j.slug, hash: j.hash }))));
  console.log(`submitted batch ${b.id}`);
  return b.id;
}

async function poll(batchId: string) {
  const map = JSON.parse(fs.readFileSync(path.join(STATE, `${batchId}.json`), "utf8")) as { id: string; slug: string; hash: string }[];
  const current = new Map(jobs().map((j) => [j.slug, j]));
  for (;;) {
    const s = (await (await fetch(`${API}/${batchId}`, { headers: H })).json()) as { processing_status: string; request_counts: Record<string, number>; results_url?: string };
    console.log(new Date().toISOString().slice(11, 19), s.processing_status, JSON.stringify(s.request_counts));
    if (s.processing_status === "ended" && s.results_url) {
      const jsonl = await (await fetch(s.results_url, { headers: H })).text();
      let ok = 0;
      let total = 0;
      for (const line of jsonl.split("\n").filter(Boolean)) {
        const row = JSON.parse(line) as { custom_id: string; result: { type: string; message?: { content: { type: string; text?: string }[]; usage: Usage; stop_reason?: string }; error?: unknown } };
        const m = map.find((x) => x.id === row.custom_id);
        if (!m) continue;
        if (row.result.type !== "succeeded" || !row.result.message) {
          console.log(`  ✗ ${m.slug}: ${row.result.type}`);
          await supabase.from("ai_calls").insert({ feature: "batch", model: MODEL, status: "error", batch: true, error: row.result.type, meta: { job: "lecture-faq", lecture: m.slug } });
          continue;
        }
        const msg = row.result.message;
        const text = msg.content.filter((c) => c.type === "text").map((c) => c.text).join("").trim();
        const cost = costOf(MODEL, msg.usage, true);
        total += cost;
        await supabase.from("ai_calls").insert({
          feature: "batch",
          model: MODEL,
          status: "ok",
          batch: true,
          input_tokens: msg.usage.input_tokens ?? 0,
          output_tokens: msg.usage.output_tokens ?? 0,
          cost_usd: cost,
          credits: creditsFor(cost),
          meta: { job: "lecture-faq", lecture: m.slug, batch: batchId },
        });
        const j = current.get(m.slug);
        if (!j || j.hash !== m.hash) {
          console.log(`  ✗ ${m.slug}: the lecture changed since this batch was submitted; run submit again`);
          continue;
        }
        const body = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const json = body.slice(body.indexOf("{"));
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(json.slice(0, json.lastIndexOf("}") + 1));
        } catch {
          // cut off (max_tokens) or malformed: keep every complete question up to the break
          const fixed = salvage(json);
          try {
            parsed = fixed ? JSON.parse(fixed) : null;
          } catch {
            parsed = null;
          }
          if (parsed) console.log(`  ! ${m.slug}: salvaged a cut-off reply (${msg.stop_reason})`);
        }
        const { scenes, dropped } = validate(j, parsed);
        if (dropped.length) console.log(`  ! ${m.slug}: dropped unknown or no-FAQ scenes ${dropped.join(", ")}`);
        const covered = j.teach.filter((id) => scenes[id]).length;
        // a partial file is better than none only if most chapters have questions; else retry next run
        if (covered < Math.ceil(j.teach.length * 0.75)) {
          console.log(`  ✗ ${m.slug}: only ${covered}/${j.teach.length} chapters answered (${msg.stop_reason}); not written`);
          continue;
        }
        const missing = j.teach.filter((id) => !scenes[id]);
        if (missing.length) console.log(`  ! ${m.slug}: no questions for ${missing.join(", ")} (will be retried next run)`);
        const long = Object.values(scenes).flat().filter((x) => words(x.a) > 90).length;
        if (long) console.log(`  ! ${m.slug}: ${long} answers over 90 words`);
        fs.mkdirSync(OUT, { recursive: true });
        const file = { lecture: m.slug, source: m.hash, generated: new Date().toISOString().slice(0, 10), scenes };
        fs.writeFileSync(outFile(m.slug), `${JSON.stringify(file, null, 2)}\n`);
        const n = Object.values(scenes).reduce((a, x) => a + x.length, 0);
        console.log(`  ✓ ${m.slug}: ${n} questions over ${Object.keys(scenes).length} chapters · $${cost.toFixed(3)}`);
        ok++;
      }
      console.log(`wrote ${ok}/${map.length} lecture FAQ files · actual cost $${total.toFixed(2)}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

const [cmd, arg] = process.argv.slice(2);
const flag = (n: string) => process.argv.includes(n);
const onlyAt = process.argv.indexOf("--only");
(async () => {
  if (cmd === "submit") {
    const id = await submit(onlyAt > 0 ? process.argv[onlyAt + 1].split(",") : null, flag("--force"), flag("--dry"));
    if (id && flag("--wait")) await poll(id);
  } else if (cmd === "poll" && arg) await poll(arg);
  else console.log("usage: lecture-faq.ts submit [--only slug[,slug]] [--force] [--dry] [--wait] | poll <batch id>");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
