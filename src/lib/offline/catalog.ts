import "server-only";
import { createHash } from "crypto";
import { unstable_cache } from "next/cache";
import { fetchMarkdownContent, getAllLearningResources } from "@/lib/github";
import { COURSE_ID, COURSE_MAP_TAG, getCourseMap } from "@/lib/learn/course";
import { loadMockSources } from "@/lib/learn/mock/load";
import { listStorySources } from "@/lib/stories";
import { getCaseFiles } from "@/components/stories/case-files";
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
  groups.push({ id: "course", title: "Course map", kind: "course", items: courseItems });

  for (const w of map.weeks) {
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

  return { course, build: "", generatedAt: Date.now(), appBytes: APP_BYTES, groups };
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
