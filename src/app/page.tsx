import { Suspense } from "react";
import { readFile } from "fs/promises";
import path from "path";
import { getAllStories, type StoryFrontmatter } from "@/lib/stories";
import { calculateReadingTime } from "@/lib/reading-time";
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

async function readingMinutes(slug: string): Promise<number | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), "content", "stories", `${slug}.md`), "utf8");
    const body = raw.replace(/^---[\s\S]*?\n---\s*\n/, "");
    return calculateReadingTime(body).minutes;
  } catch {
    return null;
  }
}

async function toTeaser(s: StoryFrontmatter, index: number, total: number): Promise<CaseTeaser> {
  const minutes = await readingMinutes(s.slug);
  const meta = [monthYear(s.date), minutes ? `${minutes} min` : null].filter(Boolean).join(" · ");
  return {
    id: `CASE-${String(total - index).padStart(3, "0")}`,
    slug: s.slug,
    meta,
    title: s.title,
    excerpt: s.excerpt,
  };
}

export default async function Home() {
  const stories = await getAllStories();
  const total = stories.length;
  const cases = await Promise.all(stories.slice(0, 3).map((s, i) => toTeaser(s, i, total)));

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
