import { Suspense } from "react";
import { getCaseFiles } from "@/components/stories/case-files";
import type { CaseFile } from "@/components/stories/case-types";
import HeroIntro from "@/components/home/HeroIntro";
import { RushSection } from "@/components/home/TatkalRush";
import CareerReplay from "@/components/home/CareerReplay";
import GamesTeaser from "@/components/home/GamesTeaser";
import PinnedRepos from "@/components/home/PinnedRepos";
import ContribSection, { ContribSectionSkeleton } from "@/components/home/contrib/ContribSection";
import Dependencies from "@/components/home/Dependencies";
import CaseFilesTeaser, { type CaseTeaser } from "@/components/home/CaseFilesTeaser";
import LearnCta from "@/components/home/LearnCta";
import HireApi from "@/components/home/HireApi";
import HomeFooter from "@/components/home/HomeFooter";

export const runtime = "nodejs"; // required for fs access on Vercel

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function monthYear(date?: string): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// Same case ids and reading times as /stories (one source: getCaseFiles).
function toTeaser(c: CaseFile): CaseTeaser {
  const meta = [monthYear(c.date), c.mins ? `${c.mins} min` : null].filter(Boolean).join(" · ");
  return { id: c.caseId, slug: c.slug, meta, title: c.title, excerpt: c.excerpt, cover: c.cover };
}

export default async function Home() {
  const files = await getCaseFiles();
  const total = files.length;
  const cases = files.slice(0, 3).map(toTeaser);

  return (
    <>
      <main id="top">
        <HeroIntro />
        <CareerReplay />
        <Dependencies />
        <RushSection />
        <GamesTeaser />
        <PinnedRepos />
        <Suspense fallback={<ContribSectionSkeleton />}>
          <ContribSection />
        </Suspense>
        <CaseFilesTeaser cases={cases} total={total} />
        <LearnCta />
        <HireApi />
      </main>
      <HomeFooter year={new Date().getFullYear()} />
    </>
  );
}
