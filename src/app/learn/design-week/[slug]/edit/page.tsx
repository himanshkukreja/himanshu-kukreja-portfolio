import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Editor from "@/components/learn/design-week/Editor";
import { ComingSoon, Hero } from "@/components/learn/design-week/DesignWeekHome";
import { DowError } from "@/lib/design-week/core";
import { loadChallenge } from "@/lib/design-week/server";
import { dowFixtures } from "@/lib/design-week/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your design · Design of the week", robots: { index: false, follow: false } };

export default async function EditRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  let d: Awaited<ReturnType<typeof loadChallenge>> = null;
  try {
    d = await loadChallenge(slug);
  } catch (e) {
    if (e instanceof DowError && e.code === "tables-missing")
      return (
        <main className="mx-auto flex max-w-[1320px] flex-col gap-10 px-4 pb-28 pt-6 sm:px-6 sm:pt-14">
          <Hero />
          <ComingSoon />
        </main>
      );
    throw e;
  }
  if (!d) notFound();
  return <Editor c={d.challenge} dev={dowFixtures()} />;
}
