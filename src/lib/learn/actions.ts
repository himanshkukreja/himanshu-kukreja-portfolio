"use server";

/**
 * Server actions for the Learn screens. They read the real course markdown on the server so the
 * client never needs whole lessons or answer keys:
 *  - getLessonStages: the stage list of one lesson (resume card: "Stage 2 of 5 · Part II · ~28 min left")
 *  - locateStages: which stage a highlight / note / bookmark sits in ("Open at Part II")
 *  - scoreMcqParts: per-part scores from saved MCQ answers (profile fallback when trial_attempts is absent)
 */
import { getLearningResource } from "@/lib/github";
import { renderLesson } from "@/lib/course/render";
import type { LessonKind, Stage } from "@/lib/course/types";
import { parseMCQMarkdown } from "@/lib/mcq-parser";

type StageInfo = { id: string; label: string; title: string; minutes: number };
type Rendered = { stages: StageInfo[]; sections: { id: string; text: string }[] };

const SAFE = /^[A-Za-z0-9._-]{1,120}$/;
const TTL = 5 * 60_000;
const cache = new Map<string, { at: number; value: Promise<Rendered | null> }>();

function textOf(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function norm(s: string) {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function load(week: string, slug: string): Promise<Rendered | null> {
  if (!SAFE.test(week) || !SAFE.test(slug)) return null;
  const key = `${week}/${slug}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  const value = (async () => {
    const data = await getLearningResource(week, slug);
    if (!data || data.resource.type === "mcq") return null;
    const rendered = await renderLesson(data.content, { kind: data.resource.type as LessonKind });
    const sections: { id: string; text: string }[] = [];
    const re = /<section[^>]*data-stage-id="([^"]+)"[^>]*>/g;
    const marks: { id: string; start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(rendered.html))) marks.push({ id: m[1], start: m.index, end: re.lastIndex });
    marks.forEach((mk, i) => {
      const stop = i + 1 < marks.length ? marks[i + 1].start : rendered.html.length;
      sections.push({ id: mk.id, text: textOf(rendered.html.slice(mk.end, stop)) });
    });
    const stages = rendered.stages.map((s: Stage) => ({ id: s.id, label: s.label, title: s.title, minutes: s.minutes }));
    return { stages, sections };
  })().catch(() => null);
  cache.set(key, { at: Date.now(), value });
  return value;
}

export async function getLessonStages(week: string, slug: string): Promise<StageInfo[]> {
  const r = await load(week, slug);
  return r?.stages || [];
}

export type StageLocation = { stageId: string; label: string; title: string } | null;

/** Find the stage that contains each text snippet. Unknown → null (callers fall back to offset links). */
export async function locateStages(
  items: { id: string; week: string; slug: string; text: string }[]
): Promise<Record<string, StageLocation>> {
  const out: Record<string, StageLocation> = {};
  const list = (Array.isArray(items) ? items : []).slice(0, 400);
  const lessons = Array.from(new Set(list.map((i) => `${i.week}/${i.slug}`))).slice(0, 40);
  const loaded = new Map<string, Rendered | null>();
  await Promise.all(
    lessons.map(async (k) => {
      const [week, slug] = k.split("/");
      loaded.set(k, await load(week, slug));
    })
  );
  for (const it of list) {
    const r = loaded.get(`${it.week}/${it.slug}`);
    out[it.id] = null;
    if (!r || !it.text) continue;
    const needle = norm(String(it.text)).slice(0, 80);
    if (needle.length < 4) continue;
    const sec = r.sections.find((s) => s.text.includes(needle)) || r.sections.find((s) => s.text.includes(needle.slice(0, 32)));
    if (!sec) continue;
    const st = r.stages.find((s) => s.id === sec.id);
    if (st) out[it.id] = { stageId: st.id, label: st.label, title: st.title };
  }
  return out;
}

export type PartScore = { part: number; title: string; correct: number; answered: number; total: number; passed: boolean };

/** Score saved answers per MCQ part without sending the answer key to the browser. */
export async function scoreMcqParts(
  input: { week: string; slug: string; answers: Record<string, string> }[]
): Promise<Record<string, PartScore[]>> {
  const out: Record<string, PartScore[]> = {};
  for (const it of (Array.isArray(input) ? input : []).slice(0, 20)) {
    if (!SAFE.test(it.week) || !SAFE.test(it.slug)) continue;
    const data = await getLearningResource(it.week, it.slug);
    if (!data) continue;
    const a = parseMCQMarkdown(data.content);
    out[it.week] = a.sections
      .filter((s) => s.questions.length)
      .map((s, i) => {
        let correct = 0;
        let answered = 0;
        s.questions.forEach((q) => {
          const pick = it.answers?.[String(q.number)];
          if (!pick) return;
          answered++;
          if (pick === q.correctAnswer) correct++;
        });
        const total = s.questions.length;
        return { part: i + 1, title: s.title.replace(/^Part\s+\d+\s*[:·-]\s*/i, ""), correct, answered, total, passed: total > 0 && correct / total >= 0.8 };
      });
  }
  return out;
}
