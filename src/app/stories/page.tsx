import type { Metadata } from "next";
import CaseFilesIndex from "@/components/stories/CaseFilesIndex";
import NewsletterStrip from "@/components/stories/NewsletterStrip";
import { getCaseFiles } from "@/components/stories/case-files";

export const runtime = "nodejs"; // required for fs access on Vercel
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;

export const metadata: Metadata = {
  title: "Case files · Himanshu Kukreja",
  description:
    "Production incidents, rush hours and the things I built, told as stories with blueprints. Each one ends with the lessons you can steal.",
};

export default async function StoriesPage() {
  const cases = await getCaseFiles();
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-24 pt-8 sm:gap-10 sm:px-6 sm:pt-[72px]">
      <CaseFilesIndex cases={cases} />
      <NewsletterStrip />
    </main>
  );
}
