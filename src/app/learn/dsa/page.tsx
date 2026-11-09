import type { Metadata } from "next";
import DsaComingSoon from "@/components/dsa/soon/DsaComingSoon";
import DsaHub from "@/components/dsa/hub/DsaHub";
import { JsonLd, breadcrumbs } from "@/lib/seo/jsonld";
import { DSA_FULL } from "@/lib/dsa/flags";
import { conceptLectureHref, getConceptIndex, getConceptLecture, getProblemIndex, getWorld, getWorlds } from "@/lib/dsa/load";
import { lectureHash, lectureMediaBase } from "@/lib/learn/lecture/load";
import type { LectureRef } from "@/components/dsa/map/Campus";
import type { WorldSpec } from "@/lib/dsa/types";

// DSA Mastery (systemdesignmastery.dev/dsa). Two builds of one route (src/lib/dsa/flags.ts):
// - NEXT_PUBLIC_DSA_MODE=soon (production until launch): only the coming-soon page with the waitlist and the founding-member
//   offer (plan §15.3). No data on the server: the waitlist card loads per-visitor state on the client, so the page is
//   prerendered at build and served from the cache. Indexable, to start ranking early.
// - NEXT_PUBLIC_DSA_MODE=full (staging): the hub, with the world atlas and the Academy campus from the content repo (ISR,
//   refreshed on every content sync); progress paints in on the client.

export const revalidate = 604800;

const TITLE = "DSA Mastery: coming soon · System Design Mastery";
const SHARE_TITLE = "DSA Mastery: data structures and algorithms through real product engineering";
const DESCRIPTION =
  "A concept-first DSA course from System Design Mastery: the 6S teaching loop, six worlds on a game map, an AI tutor, plans and curated sheets, and a problem platform in Python, Java, C++ and JavaScript. Join the waitlist: founding members keep both courses free for life.";

export const metadata: Metadata = DSA_FULL
  ? {
      title: "DSA Mastery · World map",
      description: "The DSA Mastery world atlas and the Academy map: concepts, practice problems, checkpoints and gates.",
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

async function Hub() {
  const [worlds, concepts, problems] = await Promise.all([getWorlds().catch(() => []), getConceptIndex().catch(() => []), getProblemIndex().catch(() => [])]);
  const specs: Record<string, WorldSpec | null> = Object.fromEntries(await Promise.all(worlds.map(async (w) => [w.id, await getWorld(w.id).catch(() => null)] as const)));
  // the lectures of built concepts (each cached with the DSA content): the campus panel's "▶ Lecture" button; its
  // length comes from the published recording's media.json, read in the browser (no server fetch per render)
  const lectures: Record<string, LectureRef> = {};
  await Promise.all(
    concepts
      .filter((c) => c.status === "built")
      .map(async (c) => {
        const l = await getConceptLecture(c.id).catch(() => null);
        if (l) lectures[c.id] = { href: conceptLectureHref(c.id), slug: l.quest, source: lectureHash(l) };
      }),
  );
  return <DsaHub worlds={worlds} specs={specs} lectures={lectures} mediaBase={lectureMediaBase()} concepts={concepts} problems={problems} />;
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
      {DSA_FULL ? <Hub /> : <DsaComingSoon />}
    </>
  );
}
