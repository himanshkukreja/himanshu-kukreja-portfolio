import "server-only";
import { createHash } from "crypto";
import { readDsa } from "@/lib/dsa/content";
import { getConceptIndex, getProblemIndex, getStepLabels, lessonDir, lessonHref, problemHref } from "@/lib/dsa/load";
import { stepOf, stepRank } from "@/lib/dsa/steps";
import { listDsaLectures } from "@/lib/dsa/media";
import type { CatalogGroup, CatalogItem } from "./types";

/**
 * DSA Mastery in the offline catalog (staging until launch, NEXT_PUBLIC_DSA_MODE=full): the /dsa hub and every built
 * concept, every problem (its statement, visible tests and hints ship in the page; saving one also stores the Python
 * runtime the problem room runs on, so Run works offline), the cheat sheets and the concept lectures with their
 * recorded media. Versions hash the source files (lesson.md + quiz.md, problem.md + visible tests), read a few at a time
 * like the rest of the catalog: the whole of either collection is never in memory at once.
 */

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);

async function inBatches<T, R>(list: readonly T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let at = 0; at < list.length; at += n) out.push(...(await Promise.all(list.slice(at, at + n).map(fn))));
  return out;
}

/** see catalog.ts: narration bytes per script word, captions + poster, and the page's share of the script */
const LECTURE_BYTES_PER_WORD = 5_100;
const LECTURE_FILES_BYTES = 120_000;

export async function dsaCatalogGroups(mediaBase: string | null): Promise<CatalogGroup[]> {
  const [concepts, problems, labels] = await Promise.all([getConceptIndex(), getProblemIndex(), getStepLabels()]);
  const modNum = (m: string) => stepRank(labels, m);
  const built = concepts.filter((c) => c.status === "built").sort((a, b) => modNum(a.module) - modNum(b.module) || a.order - b.order);
  const groups: CatalogGroup[] = [];

  // concepts: a rendered lesson is ~1.3x its markdown gzip (code in four languages, traces in the page)
  const lessons = await inBatches(built, 6, async (c) => {
    // a concept, or a visual lesson (structures, algorithms) with its in-article clips (~0.6 MB each, saved with it)
    const dir = lessonDir(c);
    const [lesson, quiz, clips] = await Promise.all([readDsa(`${dir}/lesson.md`).catch(() => null), readDsa(`${dir}/quiz.md`).catch(() => null), readDsa(`${dir}/clips.json`).catch(() => null)]);
    const src = (lesson || "") + (quiz || "") + (clips || "");
    const nClips = (lesson?.match(/^::clip\[/gm) || []).length;
    return { c, version: hash(src || c.id), bytes: Math.round(30_000 + src.length * 1.3 + nClips * 650_000) };
  });
  const code = (m: string) => stepOf(labels, m).step;
  groups.push({
    id: "dsa-concepts",
    title: "DSA concepts",
    kind: "dsa",
    items: [
      { url: "/dsa", title: "DSA Mastery · home", kind: "hub", tag: "MAP", group: "dsa-concepts", version: hash(JSON.stringify(built.map((c) => c.id)) + problems.length), bytes: 60_000 },
      ...lessons.map(({ c, version, bytes }): CatalogItem => ({ url: lessonHref(c), title: c.title, kind: "dsa-concept", tag: `${code(c.module)} · ${c.order}`, group: "dsa-concepts", version, bytes })),
    ],
  });

  // problems: the page carries the statement, the visible tests and every hint (hidden tests stay on the server)
  const rows = await inBatches(problems, 6, async (p) => {
    const [md, visible] = await Promise.all([readDsa(`resources/problems/${p.id}/problem.md`).catch(() => null), readDsa(`resources/problems/${p.id}/tests/visible.json`).catch(() => null)]);
    const src = (md || "") + (visible || "");
    return { url: problemHref(p.id), title: p.title, kind: "dsa-problem" as const, tag: `${code(p.module)} · ${p.level.toUpperCase()}`, group: "dsa-problems", version: hash(src || p.id), bytes: Math.round(40_000 + src.length * 0.9) };
  });
  groups.push({
    id: "dsa-problems",
    title: "DSA problems",
    kind: "dsa",
    items: [{ url: "/dsa/problems", title: `Problems · ${problems.length}`, kind: "tool", tag: "PROBLEMS", group: "dsa-problems", version: hash(problems.map((p) => p.id).join()), bytes: 30_000 }, ...rows],
  });

  // cheat sheets: cut from the lessons, so they change with them
  groups.push({
    id: "dsa-cheatsheets",
    title: "DSA cheat sheets",
    kind: "dsa",
    items: [
      { url: "/dsa/cheatsheets", title: "Cheat sheets · all patterns", kind: "cheatsheet", tag: "SHEETS", group: "dsa-cheatsheets", version: hash(lessons.map((l) => l.version).join()), bytes: 30_000 },
      ...lessons.map(({ c, version }): CatalogItem => ({ url: `/dsa/cheatsheets/${c.id}`, title: `Cheat sheet · ${c.title}`, kind: "cheatsheet", tag: `${code(c.module)} · SHEET`, group: "dsa-cheatsheets", version, bytes: 45_000 })),
    ],
  });

  // lectures: the page plus its recorded narration, music, captions and poster (never the MP4)
  const lectures = await listDsaLectures().catch(() => []);
  if (lectures.length) {
    groups.push({
      id: "dsa-lectures",
      title: "DSA lectures",
      kind: "lectures",
      items: lectures.map((l) => ({
        url: l.href,
        title: l.title,
        kind: "lecture",
        tag: l.code,
        group: "dsa-lectures",
        version: l.version,
        bytes: Math.round(40_000 + l.jsonLength * 0.4 + (mediaBase && l.recorded ? l.words * LECTURE_BYTES_PER_WORD + LECTURE_FILES_BYTES : 0)),
        ...(mediaBase && l.recorded ? { mediaBase: `${mediaBase}/${l.slug}/` } : {}),
        subject: l.questHref,
        minutes: l.minutes,
      })),
    });
  }
  return groups;
}
