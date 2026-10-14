import type { Metadata } from "next";
import CaseFilesIndex from "@/components/stories/CaseFilesIndex";
import NewsletterStrip from "@/components/stories/NewsletterStrip";
import { getCaseFiles } from "@/components/stories/case-files";

export const runtime = "nodejs"; // required for fs access on Vercel
export const dynamic = "force-dynamic";
export const revalidate = 0;

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
