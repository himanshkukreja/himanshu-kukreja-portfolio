/**
 * One-time content job: "Questions learners ask" for every lesson, written by Opus from the lesson
 * itself through the Message Batches API (half price). Each answer cites the lesson section it uses.
 * Output: <content repo>/resources/lesson-faq/<folder>/<slug>.md, served free on the lesson page and
 * used by "Ask this lesson" before it spends credits. Every result is logged in ai_calls (feature
 * "batch", batch=true) so /admin/ai shows the spend.
 *
 * usage:
 *   NODE_PATH=<server-only stub> npx tsx --env-file=.env --env-file=.env.local scripts/ai-batch/faq.ts submit [--only folder/slug] [--force]
 *   ... faq.ts poll <batch id>      (waits until done, then writes files and logs costs)
 * State (batch id → lesson keys) is kept in scripts/ai-batch/.state/ (git-ignored).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { supabase } from "@/lib/supabase";
import { costOf, creditsFor, MODELS, type Usage } from "@/lib/ai/prices";

const CONTENT = process.env.SDM_LOCAL_DIR || path.resolve(process.cwd(), "..", "system-design-mastery");
const RES = path.join(CONTENT, "resources");
const OUT = path.join(RES, "lesson-faq");
const STATE = path.join(process.cwd(), "scripts/ai-batch/.state");
const MODEL = MODELS.opus;
const API = "https://api.anthropic.com/v1/messages/batches";
const H = { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" };

const SYSTEM = `You write the "Questions learners ask" section for one lesson of a free system design course.

From the lesson below, write the 6 to 8 questions a learner is most likely to have after reading it: points that confuse people, "why not just X?", how two ideas in the lesson differ, and the follow-ups an interviewer would ask. Answer each strictly from the lesson, in under 110 words of plain, friendly English, and end each answer with the heading of the section it comes from in brackets, like [3.2 Consistent Hashing]. Don't invent numbers, products or claims that aren't in the lesson.

Format exactly, nothing before or after:
### <question>
<answer> [<section heading>]

### <question>
...`;

type Lesson = { key: string; title: string; file: string; text: string; hash: string };

function lessons(): Lesson[] {
  const out: Lesson[] = [];
  for (const d of fs.readdirSync(RES)) {
    const dir = path.join(RES, d);
    if (!fs.statSync(dir).isDirectory() || !/^(week-|bonus-problems$|problem-bank$|low-level-design$)/.test(d)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith(".md") || /mcq-assessment|^README/i.test(f)) continue;
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      const title = text.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`]/g, "").trim() || f;
      out.push({ key: `${d}/${f.replace(/\.md$/, "")}`, title, file: path.join(dir, f), text, hash: crypto.createHash("sha1").update(text).digest("hex").slice(0, 12) });
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

const outFile = (key: string) => path.join(OUT, `${key}.md`);
const upToDate = (l: Lesson) => fs.existsSync(outFile(l.key)) && fs.readFileSync(outFile(l.key), "utf8").includes(`source: ${l.hash}`);

async function submit(only: string | null, force: boolean) {
  const all = lessons().filter((l) => (!only || l.key === only) && (force || !upToDate(l)));
  if (!all.length) return console.log("nothing to do: every FAQ is up to date");
  const estimate = all.reduce((a, l) => a + costOf(MODEL, { input_tokens: Math.round(l.text.length / 3.6) + 300, output_tokens: 2200 }, true), 0);
  console.log(`${all.length} lessons · estimated ~$${estimate.toFixed(2)} (batch price)`);
  const requests = all.map((l, i) => ({
    custom_id: `faq-${i}`,
    params: { model: MODEL, max_tokens: 3000, system: SYSTEM, messages: [{ role: "user", content: `<lesson title="${l.title}">\n${l.text}\n</lesson>` }] },
  }));
  const r = await fetch(API, { method: "POST", headers: H, body: JSON.stringify({ requests }) });
  const b = (await r.json()) as { id?: string; error?: { message?: string } };
  if (!r.ok || !b.id) throw new Error(b.error?.message || `HTTP ${r.status}`);
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(path.join(STATE, `${b.id}.json`), JSON.stringify(all.map((l, i) => ({ id: `faq-${i}`, key: l.key, title: l.title, hash: l.hash }))));
  console.log(`submitted batch ${b.id}`);
  return b.id;
}

async function poll(batchId: string) {
  const map = JSON.parse(fs.readFileSync(path.join(STATE, `${batchId}.json`), "utf8")) as { id: string; key: string; title: string; hash: string }[];
  for (;;) {
    const s = (await (await fetch(`${API}/${batchId}`, { headers: H })).json()) as { processing_status: string; request_counts: Record<string, number>; results_url?: string };
    console.log(new Date().toISOString().slice(11, 19), s.processing_status, JSON.stringify(s.request_counts));
    if (s.processing_status === "ended" && s.results_url) {
      const jsonl = await (await fetch(s.results_url, { headers: H })).text();
      let ok = 0;
      let total = 0;
      for (const line of jsonl.split("\n").filter(Boolean)) {
        const row = JSON.parse(line) as { custom_id: string; result: { type: string; message?: { content: { type: string; text?: string }[]; usage: Usage }; error?: unknown } };
        const m = map.find((x) => x.id === row.custom_id);
        if (!m) continue;
        if (row.result.type !== "succeeded" || !row.result.message) {
          console.log(`  ✗ ${m.key}: ${row.result.type}`);
          await supabase.from("ai_calls").insert({ feature: "batch", model: MODEL, status: "error", batch: true, error: row.result.type, meta: { job: "faq", lesson: m.key } });
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
          meta: { job: "faq", lesson: m.key, batch: batchId },
        });
        if (!/^###\s/m.test(text)) {
          console.log(`  ✗ ${m.key}: unexpected format`);
          continue;
        }
        const file = outFile(m.key);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, `---\nlesson: ${m.key}\ntitle: ${JSON.stringify(m.title)}\nmodel: ${MODEL}\ngenerated: ${new Date().toISOString().slice(0, 10)}\nsource: ${m.hash}\n---\n\n${text}\n`);
        ok++;
      }
      console.log(`wrote ${ok}/${map.length} FAQ files · actual cost $${total.toFixed(2)}`);
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
    const id = await submit(onlyAt > 0 ? process.argv[onlyAt + 1] : null, flag("--force"));
    if (id && flag("--wait")) await poll(id);
  } else if (cmd === "poll" && arg) await poll(arg);
  else console.log("usage: faq.ts submit [--only folder/slug] [--force] [--wait] | poll <batch id>");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
