import "server-only";
import { createHash } from "crypto";
import { unstable_cache } from "next/cache";
import { fetchMarkdownContent, getAllLearningResources } from "@/lib/github";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import { loadMockSources } from "@/lib/learn/mock/load";
import { listStorySources } from "@/lib/stories";
import { getCaseFiles } from "@/components/stories/case-files";
import { getLabSummaries } from "@/lib/learn/labs/load";
import { RUNTIME_BYTES } from "@/lib/learn/labs/runtime";
import { getRevisionWeeks } from "@/lib/learn/revision/load";
import { REFERENCE_VERSION } from "@/lib/learn/numbers/reference";
import { getTrailIndex } from "@/lib/learn/trail/load";
import type { Catalog, CatalogGroup, CatalogItem, OfflineKind } from "./types";

/**
 * Everything a reader can save for offline reading, with a content version per article (hash of
 * its source markdown, so a saved copy knows when it is out of date) and a size estimate.
 *
 * Size estimates come from measured production pages: the stored copy is gzip HTML, about 1.1× the
 * markdown for a rendered lesson (Shiki code and the RSC payload repeat the text), half of it for
 * trials and mocks, plus images.
 */

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 12);
const images = (md: string) => (md.match(/!\[[^\]]*\]\([^)]+\)|<img\s/g) || []).length;

function estimate(kind: OfflineKind, md: string, variants = 0): number {
  switch (kind) {
    case "trial":
      return Math.round((8_000 + md.length * 0.42) * (1 + variants) + md.length * 0.3);
    case "mock":
      return Math.round(10_000 + md.length * 0.5);
    case "story":
      return Math.round(12_000 + md.length * 0.9 + images(md) * 90_000 + 150_000);
    case "hub":
      return 30_000;
    default:
      return Math.round(12_000 + md.length * 1.12 + images(md) * 20_000);
  }
}

/** Reader app files measured on a production build (JS incl. the Mermaid renderer, CSS, fonts). */
const APP_BYTES = 3_400_000;
/** A saved code lab page (gzip HTML incl. the RSC payload: measured ~17.5 KB). */
const LAB_PAGE_BYTES = 20_000;

async function build(course: string): Promise<Catalog> {
  const map = await getCourseMap(course);
  if (!map) throw new Error("course not found");
  const resources = (await getAllLearningResources()).filter((r) => r.course === course);
  const pathOf = new Map(resources.map((r) => [`${r.week}/${r.slug}`, r.path]));
  const md = async (week: string, slug: string) => {
    const p = pathOf.get(`${week}/${slug}`);
    if (!p) return "";
    try {
      return await fetchMarkdownContent(p);
    } catch {
      return "";
    }
  };

  const groups: CatalogGroup[] = [];
  const item = async (url: string, title: string, kind: OfflineKind, tag: string, group: string, source: string, variants?: string[]): Promise<CatalogItem> => ({
    url,
    title,
    kind,
    tag,
    group,
    version: hash(source || url),
    bytes: estimate(kind, source, variants?.length ?? 0),
    ...(variants?.length ? { variants } : {}),
  });

  // the course map itself (skill tree) and the plan
  const courseItems: CatalogItem[] = [
    {
      url: `/learn/${course}`,
      title: "Course map · skill tree",
      kind: "hub",
      tag: "MAP",
      group: "course",
      version: hash(JSON.stringify({ w: map.weeks, s: map.sideQuests, m: map.mocks ?? [] })),
      bytes: estimate("hub", ""),
    },
  ];
  if (map.plan) courseItems.push(await item(map.plan.href, map.plan.title, "plan", "PLAN", "course", await md(map.plan.week, map.plan.slug)));
  // prep tools: client-side pages (the planner carries the course map, the playground its tables)
  courseItems.push(
    { url: "/learn/plan", title: "Study planner", kind: "tool", tag: "PLANNER", group: "course", version: courseItems[0].version, bytes: 60_000 },
    { url: "/learn/numbers", title: "Numbers playground", kind: "tool", tag: "NUMBERS", group: "course", version: REFERENCE_VERSION, bytes: 45_000 }
  );
  // code labs: the index here, each lab in its world (saving a lab also stores the Python runtime once)
  const labs = await getLabSummaries().catch(() => []);
  if (labs.length) courseItems.push({ url: "/learn/labs", title: `Code labs · ${labs.length} labs`, kind: "lab", tag: "LABS", group: "course", version: hash(labs.map((l) => l.version).join()), bytes: 40_000 });
  // the practice hub: links to every tool, live state from this browser (counts ship in the page)
  courseItems.push({ url: "/learn/prep", title: "Interview prep", kind: "tool", tag: "PRACTICE", group: "course", version: hash([courseItems[0].version, ...labs.map((l) => l.version)].join()), bytes: 15_000 });
  // the other toolkit indexes the practice hub links to (small pages; their data ships in the page)
  courseItems.push({ url: "/learn/revise", title: "Revision decks", kind: "tool", tag: "REVISE", group: "course", version: courseItems[0].version, bytes: 20_000 });
  courseItems.push({ url: "/learn/mock", title: "Mock interviews", kind: "tool", tag: "MOCKS", group: "course", version: courseItems[0].version, bytes: 20_000 });
  courseItems.push({ url: "/learn/mastery", title: "Concept map", kind: "tool", tag: "CONCEPTS", group: "course", version: courseItems[0].version, bytes: 120_000 });
  // the reading trail index (measured ~140 KB gzip: every entry with its summary ships in the page)
  const trail = await getTrailIndex().catch(() => null);
  if (trail?.total) courseItems.push({ url: "/learn/reading", title: `Reading trail · ${trail.total} reads`, kind: "tool", tag: "READING", group: "course", version: hash(JSON.stringify(trail.groups)), bytes: 140_000 });
  groups.push({ id: "course", title: "Course map", kind: "course", items: courseItems });

  // interview-night revision: one deck per world (its lesson decks ride along) + the cheat sheet
  const revision = new Map((await getRevisionWeeks(course).catch(() => [])).filter((r) => r.lessons.length).map((r) => [r.key, r]));

  for (const w of map.weeks) {
    const rev = revision.get(w.key);
    const items = await Promise.all([
      ...w.lessons.map(async (l) =>
        item(l.href, l.kind === "week-preview" ? `Preview · ${w.title}` : l.label, l.kind === "week-preview" ? "preview" : "lesson", l.tag, w.key, await md(l.week, l.slug))
      ),
      ...(w.boss ? [(async () => item(w.boss!.href, `Boss · ${w.boss!.title}`, "capstone", w.boss!.tag, w.key, await md(w.boss!.week, w.boss!.slug)))()] : []),
      ...(w.trial
        ? [
            (async () =>
              item(
                w.trial!.href,
                `Trial · ${w.trial!.parts.length} parts · ${w.trial!.totalQuestions} questions`,
                "trial",
                `W${w.code} · TRIAL`,
                w.key,
                await md(w.trial!.week, w.trial!.slug),
                [...w.trial!.parts.map((p) => p.href), `${w.trial!.href}?view=all`]
              ))(),
          ]
        : []),
    ]);
    if (rev) {
      const decks = rev.lessons.map((l) => `/learn/revise/${rev.id}/${l.slug}`);
      items.push(
        { url: `/learn/revise/${rev.id}`, title: `Revision deck · ${rev.cards} cards`, kind: "revision", tag: `W${w.code} · REVISE`, group: w.key, version: rev.version, bytes: (1 + decks.length) * 30_000, variants: decks },
        { url: `/learn/cheatsheet/${rev.id}`, title: `Cheat sheet · ${w.title}`, kind: "cheatsheet", tag: `W${w.code} · SHEET`, group: w.key, version: rev.version, bytes: 30_000 }
      );
    }
    for (const l of labs.filter((x) => x.weekKey === w.key)) {
      items.push({ url: l.href, title: `Code lab · ${l.title}`, kind: "lab", tag: `W${w.code} · LAB`, group: w.key, version: l.version, bytes: LAB_PAGE_BYTES });
    }
    groups.push({ id: w.key, title: `World ${w.code} · ${w.title}`, kind: "world", items });
  }

  groups.push({
    id: "side-quests",
    title: "Side quests",
    kind: "side-quests",
    items: await Promise.all(map.sideQuests.map(async (q) => item(q.href, q.title, "sidequest", q.tag, "side-quests", await md(q.week, q.slug)))),
  });

  if (map.mocks?.length) {
    const sources = await loadMockSources().catch(() => []);
    const src = new Map(sources.map((s) => [s.slug, s.md]));
    groups.push({
      id: "mocks",
      title: "Mock interviews",
      kind: "mocks",
      items: await Promise.all(map.mocks.map((m) => item(m.href, `Mock ${String(m.n).padStart(2, "0")} · ${m.company} · ${m.title}`, "mock", m.code || `M${m.n}`, "mocks", src.get(m.slug) || ""))),
    });
  }

  try {
    const [cases, sources] = await Promise.all([getCaseFiles(), listStorySources()]);
    const body = new Map(sources.map((s) => [s.slug, s.body]));
    groups.push({
      id: "case-files",
      title: "Case files",
      kind: "case-files",
      items: await Promise.all(cases.map((c) => item(`/stories/${c.slug}`, c.title, "story", c.caseId, "case-files", body.get(c.slug) || ""))),
    });
  } catch {
    // case files unavailable: the course still saves
  }

  return { course, build: "", generatedAt: Date.now(), appBytes: APP_BYTES, runtimeBytes: RUNTIME_BYTES, groups };
}

const cached = unstable_cache((course: string) => build(course), ["offline-catalog-v1"], { revalidate: 300, tags: [COURSE_MAP_TAG] });

export async function getOfflineCatalog(course: string = COURSE_ID): Promise<Catalog | null> {
  if (course !== COURSE_ID) return null;
  try {
    // the data cache outlives deploys, so the build id is this deploy's, not the cached one
    return { ...(await cached(course)), build: process.env.NEXT_PUBLIC_HK_BUILD || "dev" };
  } catch {
    return null;
  }
}
