import "server-only";
/**
 * Trial answer keys for re-scoring stored attempts on the server: week folder → part → question
 * number → correct letter, parsed from the same MCQ markdown the trial screen uses (parts are the
 * MCQ sections with questions, numbered 1.. in file order, exactly like src/lib/learn/course.ts).
 * Cached per instance for 10 minutes. A file that can't be read throws: certificates are never
 * issued against a missing key.
 */
import { getLearningResource } from "@/lib/github";
import { parseMCQMarkdown } from "@/lib/mcq-parser";
import type { CertCourse, TrialKey } from "./core";

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; key: Promise<TrialKey> }>();

async function loadKey(week: string, slug: string): Promise<TrialKey> {
  const data = await getLearningResource(week, slug);
  if (!data) throw new Error(`trial ${week}/${slug} could not be read`);
  const a = parseMCQMarkdown(data.content);
  const key: TrialKey = {};
  a.sections
    .filter((s) => s.questions.length > 0)
    .forEach((s, i) => {
      const part: Record<number, string> = {};
      s.questions.forEach((q) => {
        if (q.correctAnswer) part[q.number] = q.correctAnswer;
      });
      key[i + 1] = part;
    });
  return key;
}

function keyFor(week: string, slug: string): Promise<TrialKey> {
  const id = `${week}/${slug}`;
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL) return hit.key;
  const key = loadKey(week, slug);
  cache.set(id, { at: Date.now(), key });
  key.catch(() => cache.delete(id));
  return key;
}

/** Keys for every trial of the course, keyed by the trial's week folder. */
export async function trialKeys(course: CertCourse): Promise<Record<string, TrialKey>> {
  const out: Record<string, TrialKey> = {};
  await Promise.all(
    course.worlds
      .filter((w) => w.trial)
      .map(async (w) => {
        out[w.trial!.week] = await keyFor(w.trial!.week, w.trial!.slug);
      })
  );
  return out;
}
