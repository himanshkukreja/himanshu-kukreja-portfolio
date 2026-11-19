import type { Metadata } from "next";
import DsaComingSoon from "@/components/dsa/soon/DsaComingSoon";
import CourseHome from "@/components/dsa/home/CourseHome";
import type { LectureRef } from "@/components/dsa/home/useLectureSeconds";
import { JsonLd, breadcrumbs } from "@/lib/seo/jsonld";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getConceptIndex, getConceptLecture, getConceptShortIds, getLessonMinutes, getProblemIndex, getStepLabels, getWorld } from "@/lib/dsa/load";
import { dsaShortHeads, liveDsaShortIds } from "@/lib/dsa/media";
import { buildOutline } from "@/lib/dsa/outline";
import { getLeanBranches, getLeanIndex } from "@/lib/dsa/kinds-load";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";

// DSA Mastery (systemdesignmastery.dev/dsa). Two builds of one route (src/lib/dsa/flags.ts):
// - NEXT_PUBLIC_DSA_MODE=soon (production until launch): only the coming-soon page with the waitlist and the founding-member
//   offer (plan §15.3). No data on the server: the waitlist card loads per-visitor state on the client, so the page is
//   prerendered at build and served from the cache. Indexable, to start ranking early.
// - NEXT_PUBLIC_DSA_MODE=full (staging): the course home (Continue, the outline of the four parts, Today) from the content
//   repo (ISR, refreshed on every content sync); progress paints in on the client. `?view=lectures` and `#m3` are read in the
//   browser, so the page stays static.

export const revalidate = 604800;

const TITLE = "DSA Mastery: coming soon · System Design Mastery";
const SHARE_TITLE = "DSA Mastery: data structures and algorithms through real product engineering";
const LIVE_DESCRIPTION =
  "DSA Mastery from System Design Mastery: four parts of lessons, practice problems and checkpoint quizzes, an AI tutor, and a judge in Python, Java, C++ and JavaScript. Learn data structures and algorithms by doing.";
const DESCRIPTION =
  "A concept-first DSA course from System Design Mastery: the 6S teaching loop, six worlds on a game map, an AI tutor, plans and curated sheets, and a problem platform in Python, Java, C++ and JavaScript. Join the waitlist: founding members keep both courses free for life.";

export const metadata: Metadata = DSA_FULL
  ? {
      title: "DSA Mastery: learn data structures and algorithms by doing",
      description: LIVE_DESCRIPTION,
      alternates: { canonical: "/dsa" },
      openGraph: { title: SHARE_TITLE, description: LIVE_DESCRIPTION, url: "/dsa", type: "website" },
      twitter: { card: "summary_large_image", title: SHARE_TITLE, description: LIVE_DESCRIPTION },
    }
  : {
      title: TITLE,
      description: DESCRIPTION,
      alternates: { canonical: "/dsa" },
      openGraph: { title: SHARE_TITLE, description: DESCRIPTION, url: "/dsa", type: "website" },
      twitter: { card: "summary_large_image", title: SHARE_TITLE, description: DESCRIPTION },
    };

async function Home() {
  const [academy, concepts, problems, steps, minutes, branches, leanAll] = await Promise.all([
    getWorld("academy").catch(() => null),
    getConceptIndex().catch(() => []),
    getProblemIndex().catch(() => []),
    getStepLabels().catch(() => ({})),
    getLessonMinutes().catch(() => ({}) as Record<string, number>),
    getLeanBranches().catch(() => []),
    getLeanIndex().catch(() => []),
  ]);
  if (!academy) return <p className="m-0 mx-auto max-w-[720px] border border-line bg-surface p-5 text-fg-2">The course couldn&apos;t load just now. Please refresh in a minute.</p>;
  const built = concepts.filter((c) => c.status === "built");
  // the lectures of built concepts (each cached with the DSA content): the outline's lecture view; a length comes from the
  // published recording's media.json, read in the browser (no server fetch per render)
  const lectures: Record<string, LectureRef> = {};
  const shorts: Record<string, string[]> = {};
  await Promise.all(
    built.map(async (c) => {
      const [l, ids] = await Promise.all([getConceptLecture(c.id).catch(() => null), getConceptShortIds(c.id).then(liveDsaShortIds).catch(() => [] as string[])]);
      if (l) lectures[c.id] = { slug: l.quest, source: lectureHash(l) };
      if (ids.length) shorts[c.id] = ids;
    }),
  );
  // a short's first scene headline: the cover shown while its video is not rendered yet (Quick review), from the shorts manifest
  const shortHeads = await dsaShortHeads();
  // side branches (streets, camp tents, Core 150 gap sets) hang off their station on the map; company sets are not on it
  const outline = buildOutline(academy, concepts, problems, steps, minutes, branches.map((b) => ({ station: b.station!, key: b.key, kind: b.kind, module: b.module, lesson: b.id, title: b.title, href: b.href, minutes: b.minutes, problemCount: b.ladder.length })));
  return (
    <CourseHome
      outline={outline}
      academy={academy}
      concepts={built.map((c) => ({ id: c.id, title: c.title, summary: c.summary, minutes: minutes[c.id] || undefined }))}
      problems={problems.map((p) => ({ id: p.id, title: p.title, level: p.level, minutes: p.minutes, concept: p.concept }))}
      lectures={lectures}
      mediaBase={lectureMediaBase()}
      shorts={shorts}
      shortHeads={shortHeads}
      sets={leanAll.filter((l) => l.company).map((l) => ({ key: l.key, title: l.title, group: l.moduleTitle.replace(/ interview set$/i, ""), href: l.href, problems: l.ladder.length }))}
    />
  );
}

export default function DsaPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbs([
          { name: "System Design Mastery", path: "/" },
          { name: "DSA Mastery", path: "/dsa" },
        ])}
      />
      {DSA_FULL ? <Home /> : <DsaComingSoon />}
    </>
  );
}
