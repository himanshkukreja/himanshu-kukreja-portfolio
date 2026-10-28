import "server-only";
/**
 * What the admin needs about every released short beyond the feed's card: its summary and first line, its real
 * length and MP4 (the recorded media.json on the media host), and when each narrated step starts (media.json
 * `starts`, one per step of the script) with the scene it belongs to. Read once an hour (tag "course-map"),
 * never per request: /admin/distribution and the shorts drop-off view both use it.
 */
import { unstable_cache } from "next/cache";
import { COURSE_MAP_TAG } from "@/lib/learn/course";
import { getShort, lectureHash } from "@/lib/learn/lecture/load";
import { listAllShorts } from "./load";

export type ShortPack = {
  id: string;
  summary: string;
  /** the first narrated line */
  hook: string;
  /** seconds of the recorded media (null: no media.json) */
  duration: number | null;
  /** the MP4 on the media host (null: no media.json) */
  video: string | null;
  /** start of each narrated step, seconds */
  starts: number[];
  /** recorded: media.json's own step times; estimated: spread by word count over the length (no media.json) */
  timing: "recorded" | "estimated";
  /** the scene index of each step */
  stepScene: number[];
  sceneTitles: string[];
  /** media.json was made from another version of the script (timing may be off) */
  stale: boolean;
};

type Media = { source?: string; video?: string; duration?: number; starts?: number[] };

const base = () => (process.env.NEXT_PUBLIC_LECTURE_MEDIA || "").replace(/\/$/, "");

async function media(id: string): Promise<Media | null> {
  const b = base();
  if (!/^https?:\/\//.test(b)) return null;
  try {
    const res = await fetch(`${b}/${id}/media.json`, { next: { revalidate: 3600 } });
    return res.ok ? ((await res.json()) as Media) : null;
  } catch {
    return null;
  }
}

/** Run `fn` over `items`, `n` at a time. */
async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

async function load(): Promise<ShortPack[]> {
  const shorts = await listAllShorts();
  const packs = await pool(shorts, 16, async (s): Promise<ShortPack | null> => {
    const [l, m] = await Promise.all([getShort(s.id).catch(() => null), media(s.id)]);
    if (!l) return null;
    const steps = l.scenes.flatMap((sc, i) => sc.steps.map(() => i));
    const recorded = Array.isArray(m?.starts) && m.starts.length === steps.length && m.starts.every((x) => Number.isFinite(x)) ? m.starts.map((x) => Math.round(x * 100) / 100) : null;
    const duration = m?.duration && Number.isFinite(m.duration) ? Math.round(m.duration * 10) / 10 : null;
    // no recorded timing: each step gets its share of the length by word count
    const words = l.scenes.flatMap((sc) => sc.steps.map((st) => Math.max(1, st.say.split(/\s+/).length)));
    const total = words.reduce((a, w) => a + w, 0);
    let acc = 0;
    const estimated = words.map((w) => {
      const t = Math.round(((acc / total) * (duration ?? s.seconds)) * 100) / 100;
      acc += w;
      return t;
    });
    return {
      id: s.id,
      summary: l.summary || "",
      hook: l.scenes[0]?.steps[0]?.say?.trim() || l.title,
      duration,
      video: m?.video ? `${base()}/${s.id}/${m.video}` : null,
      starts: recorded ?? estimated,
      timing: recorded ? "recorded" : "estimated",
      stepScene: steps,
      sceneTitles: l.scenes.map((sc) => sc.title),
      stale: !!m?.source && m.source !== lectureHash(l),
    };
  });
  return packs.filter((p): p is ShortPack => !!p);
}

export const shortPacks = unstable_cache(load, ["shorts-pack-v1"], { revalidate: 3600, tags: [COURSE_MAP_TAG] });

/** One short's narration: each step's line and the scene it is in (the drop-off detail and the transcript). */
export async function shortLines(id: string): Promise<{ scene: number; sceneTitle: string; say: string }[] | null> {
  const l = await getShort(id);
  if (!l) return null;
  return l.scenes.flatMap((sc, i) => sc.steps.map((st) => ({ scene: i, sceneTitle: sc.title, say: st.say.trim() })));
}
