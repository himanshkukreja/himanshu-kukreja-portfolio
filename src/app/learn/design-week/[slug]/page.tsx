import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ChallengePage from "@/components/learn/design-week/ChallengePage";
import { ComingSoon, Hero } from "@/components/learn/design-week/DesignWeekHome";
import { DowError } from "@/lib/design-week/core";
import { loadChallenge } from "@/lib/design-week/server";
import { dowFixtures } from "@/lib/design-week/store";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed every 5 minutes (state changes over time) and on save; per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 300;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ slug: string }> };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

async function load(slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  try {
    return await loadChallenge(slug);
  } catch (e) {
    if (e instanceof DowError && e.code === "tables-missing") return "missing" as const;
    throw e;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug).catch(() => null);
  if (!d || d === "missing") return { title: "Design of the week · System Design Mastery" };
  return {
    title: `${d.challenge.title} · Design of the week`,
    description: d.challenge.summary || "One open system design problem a week, voted by the community.",
    alternates: { canonical: `/learn/design-week/${slug}` },
  };
}

export default async function ChallengeRoute({ params }: Params) {
  const { slug } = await params;
  const d = await load(slug);
  if (d === "missing")
    return (
      <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-28 pt-6 sm:px-6 sm:pt-14">
        <Hero />
        <ComingSoon />
      </main>
    );
  if (!d) notFound();
  return <ChallengePage data={d} dev={dowFixtures()} />;
}
