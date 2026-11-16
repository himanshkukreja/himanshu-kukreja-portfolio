import type { Metadata } from "next";
import DsaComingSoon from "@/components/dsa/soon/DsaComingSoon";
import CourseHome from "@/components/dsa/home/CourseHome";
import type { LectureRef } from "@/components/dsa/home/useLectureSeconds";
import { JsonLd, breadcrumbs } from "@/lib/seo/jsonld";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getConceptIndex, getConceptLecture, getConceptShortIds, getLessonMinutes, getProblemIndex, getStepLabels, getWorld } from "@/lib/dsa/load";
import { buildOutline } from "@/lib/dsa/outline";
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
const DESCRIPTION =
  "A concept-first DSA course from System Design Mastery: the 6S teaching loop, six worlds on a game map, an AI tutor, plans and curated sheets, and a problem platform in Python, Java, C++ and JavaScript. Join the waitlist: founding members keep both courses free for life.";

export const metadata: Metadata = DSA_FULL
  ? {
      title: "DSA Mastery · Learn",
      description: "Your next DSA Mastery step and the whole course: four parts of lessons, practice problems and checkpoint quizzes.",
      alternates: { canonical: "/dsa" },
      robots: { index: false, follow: false },
    }
  : {
      title: TITLE,
      description: DESCRIPTION,
      alternates: { canonical: "/dsa" },
      openGraph: { title: SHARE_TITLE, description: DESCRIPTION, url: "/dsa", type: "website" },
      twitter: { card: "summary_large_image", title: SHARE_TITLE, description: DESCRIPTION },
    };

async function Home() {
  const [academy, concepts, problems, steps, minutes] = await Promise.all([
    getWorld("academy").catch(() => null),
    getConceptIndex().catch(() => []),
    getProblemIndex().catch(() => []),
    getStepLabels().catch(() => ({})),
    getLessonMinutes().catch(() => ({}) as Record<string, number>),
  ]);
  if (!academy) return <p className="m-0 mx-auto max-w-[720px] border border-line bg-surface p-5 text-fg-2">The course couldn&apos;t load just now. Please refresh in a minute.</p>;
  const built = concepts.filter((c) => c.status === "built");
  // the lectures of built concepts (each cached with the DSA content): the outline's lecture view; a length comes from the
  // published recording's media.json, read in the browser (no server fetch per render)
  const lectures: Record<string, LectureRef> = {};
  const shorts: Record<string, string[]> = {};
  await Promise.all(
    built.map(async (c) => {
      const [l, ids] = await Promise.all([getConceptLecture(c.id).catch(() => null), getConceptShortIds(c.id).catch(() => [] as string[])]);
      if (l) lectures[c.id] = { slug: l.quest, source: lectureHash(l) };
      if (ids.length) shorts[c.id] = ids;
    }),
  );
  const outline = buildOutline(academy, concepts, problems, steps, minutes);
  return (
    <CourseHome
      outline={outline}
      academy={academy}
      concepts={built.map((c) => ({ id: c.id, title: c.title, summary: c.summary, minutes: minutes[c.id] || undefined }))}
      problems={problems.map((p) => ({ id: p.id, title: p.title, level: p.level, minutes: p.minutes, concept: p.concept }))}
      lectures={lectures}
      mediaBase={lectureMediaBase()}
      shorts={shorts}
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
