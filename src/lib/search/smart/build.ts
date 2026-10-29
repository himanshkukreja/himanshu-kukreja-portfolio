import "server-only";
/**
 * Builds smart search's document index, in three parts served by /api/search/index/<part> (each about
 * 2 MB, well under the 4.5 MB response cap, and built separately so none does another's work):
 *   a: the core course lessons (weeks 0-10, bosses, the plan) and each of their sections
 *   b: side quests, interview problems and LLD rounds, and each of their sections
 *   c: lesson FAQs, follow-up drills, lectures, case files, mock interviews, war stories and war rooms,
 *      concepts, code labs, design sheets and companies
 * Lecture moments and shorts are not here: they come from the ⌘K transcript index (/api/search/transcripts).
 *
 * Only what learners can see: side quests come from the course map, which already leaves out hidden and
 * scheduled ones (publishing controls), and their sheets, drills, FAQs and lectures go with them. Quest
 * entries also carry their control key (`gate`), checked again on every query.
 *
 * Rows are kept small: a section's link, place and summary are filled in from its lesson when the engine
 * loads (see SmartEngine.resolve), so they aren't repeated thousands of times.
 */
import { fetchGitHubContent, fetchMarkdownContent, getAllLearningResources, isContentMissing, type LearningResource } from "@/lib/github";
import { getCourseMap } from "@/lib/learn/course";
import type { CourseLesson, CourseMap } from "@/lib/learn/types";
import { listLectures } from "@/lib/learn/lecture/load";
import { listStorySources } from "@/lib/stories";
import { loadMockSources, plainText } from "@/lib/learn/mock/load";
import { getWarStories } from "@/lib/learn/war/load";
import { getCatalogue } from "@/lib/concepts/load";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { getSheetSummaries, SHEETS_DIR } from "@/lib/learn/sheets/load";
import { getCompanies, getCompany } from "@/lib/learn/prep/load";
import { CATEGORY_LABEL } from "@/lib/learn/prep/types";
import { parseFaq } from "@/lib/learn/faq/parse";
import { DRILLS_DIR, parseDrills } from "@/lib/learn/drills/parse";
import type { LessonKind } from "@/lib/course/types";
import { lessonSections } from "./sections";
import { lead, mdPlain } from "./text";
import { docToRow, type Doc, type DocIndex, type Kind } from "./types";

export const INDEX_PARTS = ["a", "b", "c"] as const;
export type IndexPart = (typeof INDEX_PARTS)[number];

/** what the server keeps of each body to score (the page never downloads it) */
const SECTION_CHARS = 1200;
const DOC_CHARS = 3000;
/** sections shorter than this are left out (a heading with one line under it) */
const MIN_SECTION = 90;

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

const read = async (path: string): Promise<string | null> => {
  try {
    return await fetchMarkdownContent(path);
  } catch (e) {
    if (isContentMissing(e)) return null;
    throw e;
  }
};

const listMd = async (dir: string): Promise<string[]> => {
  try {
    return (await fetchGitHubContent(dir)).filter((f) => f.type === "file" && /\.md$/.test(f.name) && !/^readme/i.test(f.name)).map((f) => f.path);
  } catch (e) {
    if (isContentMissing(e)) return [];
    throw e;
  }
};

const noFrontmatter = (md: string) => md.replace(/^﻿/, "").replace(/^---\n[\s\S]*?\n---\n/, "");

const doc = (d: Partial<Doc> & Pick<Doc, "id" | "kind" | "title" | "href">): Doc => ({ sub: "", summary: "", text: "", kw: "", gate: "", rel: [], parent: "", at: -1, ...d });

export const lessonId = (week: string, slug: string) => `L:${week}/${slug}`;

type Lesson = { l: CourseLesson; r: LearningResource; kind: Kind; place: string };

/** The course's lessons as the learner sees them (hidden or scheduled side quests are not in the map). */
async function courseLessons(): Promise<{ map: CourseMap; lessons: Lesson[]; byHref: Map<string, string>; live: Set<string> }> {
  const [map, resources] = await Promise.all([getCourseMap(), getAllLearningResources()]);
  if (!map) throw new Error("course map unavailable");
  const byKey = new Map(resources.map((r) => [`${r.week}/${r.slug}`, r]));
  const lessons: Lesson[] = [];
  const add = (l: CourseLesson | null, kind: Kind, place: string) => {
    const r = l && byKey.get(`${l.week}/${l.slug}`);
    if (l && r) lessons.push({ l, r, kind, place });
  };
  add(map.plan, "lesson", "Course plan");
  for (const w of map.weeks) {
    for (const l of w.lessons) add(l, "lesson", w.title);
    add(w.boss, "lesson", w.title);
  }
  for (const l of map.sideQuests) add(l, "quest", "Side quest");
  for (const l of map.problems ?? []) add(l, "problem", "Interview problem");
  for (const l of map.lld ?? []) add(l, "lld", "Low-level design");
  const byHref = new Map(lessons.map(({ l }) => [l.href, lessonId(l.week, l.slug)]));
  return { map, lessons, byHref, live: new Set(map.sideQuests.map((q) => q.slug)) };
}

/** Parts a and b: lessons (core, or quests / problems / LLD) and their sections. */
async function lessonPart(core: boolean): Promise<{ docs: Doc[]; syn: string[][] }> {
  const { lessons } = await courseLessons();
  const docs: Doc[] = [];
  await pool(lessons.filter((x) => (x.kind === "lesson") === core), 8, async ({ l, r, kind, place }) => {
    const md = await read(r.path);
    if (!md) return;
    const id = lessonId(l.week, l.slug);
    const gate = kind === "quest" ? `quest:${l.slug}` : "";
    let parts: ReturnType<typeof lessonSections> | null = null;
    try {
      parts = lessonSections(md, r.type as LessonKind);
    } catch {
      parts = null;
    }
    const secs = parts?.sections ?? [];
    const intro = secs.find((s) => s.text)?.text ?? "";
    docs.push(
      doc({
        id,
        kind,
        title: l.title,
        sub: kind === "lesson" ? (place === "Course plan" ? l.tag : `${l.tag} · ${place}`) : `${l.tag} · ${place}`,
        href: l.href,
        summary: lead(parts?.subtitle || parts?.lede || intro, 200),
        text: [parts?.subtitle, parts?.lede, intro.slice(0, 700)].filter(Boolean).join(" "),
        // the lesson's outline: its h1/h2 headings weigh like keywords
        kw: secs
          .filter((s) => s.depth <= 2)
          .map((s) => s.title)
          .join(" · ")
          .slice(0, 900),
        gate,
      }),
    );
    for (const s of secs) {
      if (s.text.length < MIN_SECTION) continue;
      // href "#id", place and summary are filled in from the lesson at load (see the header)
      docs.push(doc({ id: `S:${l.week}/${l.slug}#${s.id}`, kind: "section", title: s.title, href: `#${s.id}`, text: s.text.slice(0, SECTION_CHARS), gate, parent: id }));
    }
  });
  return { docs, syn: [] };
}

/** Part c: everything that isn't a lesson body. */
async function partC(): Promise<{ docs: Doc[]; syn: string[][] }> {
  const { map, lessons, byHref, live } = await courseLessons();
  const docs: Doc[] = [];

  // lesson FAQs ("Questions learners ask") and side-quest follow-up drills
  await pool(lessons, 8, async ({ l, kind }) => {
    const id = lessonId(l.week, l.slug);
    const gate = kind === "quest" ? `quest:${l.slug}` : "";
    const faqRaw = await read(`resources/lesson-faq/${l.week}/${l.slug}.md`);
    const faq = faqRaw ? parseFaq(faqRaw) : null;
    faq?.items.forEach((it, k) => docs.push(doc({ id: `F:${l.week}/${l.slug}#${k + 1}`, kind: "faq", title: it.q, sub: "FAQ", href: "#faq-h", text: it.a.replace(/\s*\[[^\]]+\]\s*$/, "").slice(0, 700), gate, parent: id })));
    if (kind !== "quest") return;
    const raw = await read(`${DRILLS_DIR}/${l.slug}.md`);
    const drills = raw ? parseDrills(raw, l.slug) : null;
    drills?.items.forEach((it) =>
      docs.push(
        doc({
          id: `D:${l.slug}#${it.id}`,
          kind: "drill",
          title: it.q,
          sub: "Follow-up drill",
          href: "#follow-up-drills",
          summary: lead(it.pushesOn || it.strong[0] || "", 170),
          text: [it.pushesOn, ...it.strong, ...it.must].join(" ").slice(0, 1000),
          gate,
          parent: id,
        }),
      ),
    );
  });

  // lectures (their moments come from the transcript index)
  for (const v of await listLectures().catch(() => [])) {
    const quest = v.track === "quests";
    if (quest && !live.has(v.slug)) continue;
    docs.push(
      doc({
        id: `V:${v.slug}`,
        kind: "lecture",
        title: v.title,
        sub: `${v.code} · ${v.minutes} min lecture`,
        href: v.href,
        summary: lead(v.summary, 200),
        text: `${v.summary} ${v.quest}`,
        gate: quest ? `quest:${v.slug}` : "",
        parent: byHref.get(v.questHref) ?? "",
      }),
    );
  }

  // case files (repo and published CMS ones)
  for (const c of await listStorySources().catch(() => [])) {
    const text = mdPlain(c.body);
    docs.push(doc({ id: `C:${c.slug}`, kind: "case", title: c.title, sub: "Case file", href: `/stories/${c.slug}`, summary: lead(c.excerpt || text, 200), text: text.slice(0, DOC_CHARS), kw: (c.tags ?? []).join(" ") }));
  }

  // mock interviews
  const mockSrc = new Map((await loadMockSources().catch(() => [])).map((m) => [m.slug, m]));
  for (const m of map.mocks ?? []) {
    const src = mockSrc.get(m.slug);
    docs.push(
      doc({
        id: `MK:${m.slug}`,
        kind: "mock",
        title: `${m.company}: ${m.title}`,
        sub: `${m.code} · mock interview · after W${m.afterCode}`,
        href: m.href,
        summary: lead(`${m.role} with ${m.interviewer}. Covers ${m.coversLabel}.`, 200),
        text: src ? plainText(src.md).replace(/\s+/g, " ").slice(0, DOC_CHARS) : m.coversLabel,
        kw: m.coversLabel,
      }),
    );
  }

  // war stories and war rooms: the listing for titles, the raw markdown for the words (no render)
  const war = await getWarStories().catch(() => ({ stories: [], rooms: [] }));
  const byName = (paths: string[]) => new Map(paths.map((p) => [(p.split("/").pop() ?? "").replace(/\.md$/, ""), p]));
  const storyFiles = byName(await listMd("resources/war-stories/stories"));
  const roomFiles = byName(await listMd("resources/war-stories/war-room"));
  await pool(war.stories, 8, async (s) => {
    const p = storyFiles.get(s.slug);
    const raw = p ? await read(p) : null;
    docs.push(doc({ id: `WS:${s.slug}`, kind: "war", title: s.title, sub: `War story · ${s.company} · ${s.when}`, href: s.href, summary: lead(s.hook, 200), text: raw ? mdPlain(noFrontmatter(raw)).slice(0, DOC_CHARS) : s.hook, kw: `${s.company} ${s.theme}` }));
  });
  await pool(war.rooms, 8, async (r) => {
    const p = roomFiles.get(r.slug);
    const raw = p ? await read(p) : null;
    docs.push(
      doc({
        id: `WR:${r.slug}`,
        kind: "war",
        title: r.title,
        sub: `War room · ${r.sev} · ${r.company}`,
        href: r.href,
        summary: lead(`${r.product}. Based on ${r.basedOn}.`, 200),
        text: raw ? mdPlain(noFrontmatter(raw)).slice(0, DOC_CHARS) : r.basedOn,
        kw: `${r.company} ${r.product} incident outage`,
      }),
    );
  });

  // concepts, and their aliases as synonym groups
  const { catalogue } = await getCatalogue();
  const titleOf = new Map(lessons.map((x) => [`${x.l.week}/${x.l.slug}`, x.l.title]));
  const syn: string[][] = [];
  for (const c of catalogue.concepts) {
    docs.push(
      doc({
        id: `K:${c.id}`,
        kind: "concept",
        title: c.term,
        sub: `Taught in ${titleOf.get(c.taught.lesson) ?? c.taught.lesson}`,
        href: `/learn/concepts/${c.id}`,
        summary: lead(c.definition, 200),
        text: [c.definition, ...c.refresher].join(" "),
        kw: c.aliases.join(" · "),
        rel: [`S:${c.taught.lesson}#${c.taught.anchor}`, ...c.also.slice(0, 2).map((a) => `S:${a.lesson}#${a.anchor}`)],
      }),
    );
    const names = [c.term, ...c.aliases].map((x) => x.toLowerCase().trim()).filter((x) => x.length > 2);
    if (names.length > 1) syn.push(names);
  }

  // code labs
  for (const lab of await getLabSummaries().catch(() => [])) {
    docs.push(
      doc({
        id: `LB:${lab.id}`,
        kind: "lab",
        title: lab.title,
        sub: `Code lab · W${lab.weekCode} · ${lab.topic}`,
        href: lab.href,
        summary: lead(lab.summary, 200),
        text: `${lab.summary} ${lab.topic} ${lab.lessons.map((x) => x.title).join(" ")}`,
        kw: lab.topic,
        rel: lab.lessons.map((x) => byHref.get(x.href.split("#")[0]) ?? "").filter(Boolean),
      }),
    );
  }

  // design sheets (live side quests only)
  const sheets = (await getSheetSummaries().catch(() => [])).filter((s) => live.has(s.slug));
  await pool(sheets, 8, async (s) => {
    const raw = await read(`${SHEETS_DIR}/${s.slug}.md`);
    docs.push(
      doc({
        id: `DS:${s.slug}`,
        kind: "sheet",
        title: `${s.title}: design sheet`,
        sub: `${s.code} · one-page design sheet`,
        href: s.href,
        summary: lead(s.summary, 200),
        text: raw ? mdPlain(raw).slice(0, DOC_CHARS) : s.summary,
        kw: s.sections.map((x) => x.title).join(" · "),
        gate: `quest:${s.slug}`,
        parent: byHref.get(s.quest.href) ?? "",
      }),
    );
  });

  // companies (interview prep): their study path is `rel`
  const companies = await getCompanies().catch(() => []);
  await pool(companies, 8, async (s) => {
    const c = await getCompany(s.slug).catch(() => null);
    if (!c) return;
    docs.push(
      doc({
        id: `CO:${c.slug}`,
        kind: "company",
        title: c.name,
        sub: `Interview prep · ${CATEGORY_LABEL[c.category] ?? c.category} · ${c.questions} questions`,
        href: c.href,
        summary: lead(`${c.builds}. Focus: ${c.focus.join(", ")}.`, 200),
        text: [c.builds, ...c.focus, ...c.list.map((q) => q.q), ...c.rounds.map((r) => `${r.name}: ${r.note}`)].join(". ").slice(0, DOC_CHARS),
        kw: `${c.name} interview ${c.focus.join(" ")}`,
        rel: c.path.map((a) => byHref.get(a.href.split("#")[0]) ?? "").filter(Boolean),
      }),
    );
  });
  return { docs, syn };
}

export async function buildDocIndex(part: IndexPart): Promise<DocIndex> {
  const { docs, syn } = part === "c" ? await partC() : await lessonPart(part === "a");
  // a stable order (the pools finish in any order)
  docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { v: 1, built: new Date().toISOString(), d: docs.map(docToRow), syn };
}
