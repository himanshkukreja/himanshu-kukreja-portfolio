import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
// v1 is the direction that shipped: the lab renders the live home components.
import PlayerHero from "@/components/home/HeroIntro";
import SkillTree from "@/components/home/Dependencies";
import CampaignMap from "@/components/home/CareerReplay";
import RepoHero, { GitGraph, Grep } from "@/components/home/showcase/v2/RepoExplorer";
import { CareerTrace, TraceHero } from "@/components/home/showcase/v3/Trace";

export const metadata: Metadata = { title: "Showcase lab", robots: { index: false, follow: false } };

const VARIANTS = [
  { v: "1", name: "Player card (shipped)", note: "RPG character sheet · skill tree with receipts · platformer career map" },
  { v: "2", name: "Repo", note: "Profile as a repo in an editor · grep the receipts · git graph with parallel branches" },
  { v: "3", name: "Trace", note: "tail -f career log · career as a trace waterfall · skills heatmap over time" },
];

export default async function ShowcaseLab({ searchParams }: { searchParams: Promise<{ v?: string }> }) {
  // Dev-only design lab: never shipped.
  if (process.env.NODE_ENV === "production") notFound();
  const { v = "1" } = await searchParams;

  return (
    <main>
      <nav aria-label="Concepts" className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-2 px-4 pt-4 sm:px-6">
        <span className="font-mono text-[11px] uppercase tracking-label text-fg-3">lab · showcase</span>
        {VARIANTS.map((x) => (
          <Link
            key={x.v}
            href={`/lab/showcase?v=${x.v}`}
            aria-current={v === x.v ? "page" : undefined}
            title={x.note}
            className={`inline-flex min-h-10 items-center border px-3 font-mono text-xs no-underline ${
              v === x.v ? "border-signal bg-signal text-on-signal" : "border-line-strong text-fg-2 hover:text-fg"
            }`}
          >
            v{x.v} · {x.name}
          </Link>
        ))}
      </nav>
      {v === "1" && (
        <>
          <PlayerHero />
          <CampaignMap />
          <SkillTree />
        </>
      )}
      {v === "2" && (
        <>
          <RepoHero />
          <GitGraph />
          <Grep />
        </>
      )}
      {v === "3" && (
        <>
          <TraceHero />
          <CareerTrace />
        </>
      )}
    </main>
  );
}
