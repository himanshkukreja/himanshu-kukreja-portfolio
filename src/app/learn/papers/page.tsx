import Link from "next/link";
import { getPaperSummaries } from "@/lib/learn/papers/load";
import PapersIndex from "@/components/learn/papers/PapersIndex";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed hourly and on every content push; the learner's scores load in the browser.
export const revalidate = 3600;

export const metadata = {
  title: "Written papers · System Design Mastery",
  description:
    "Question papers you answer by hand, with handwriting and diagrams on an iPad, a tablet or a laptop, graded point by point against a marking scheme. One for every week and side quest.",
  alternates: { canonical: "/learn/papers" },
};

export default async function PapersPage() {
  const papers = await getPaperSummaries();
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-14">
      <header className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
          <Link href="/learn/arena" className="hover:text-fg">
            Arena
          </Link>
          <span aria-hidden>/</span>
          <span className="text-signal-text">Written papers</span>
        </nav>
        <h1 className="m-0 font-display text-[clamp(44px,8vw,92px)] font-extrabold leading-[0.9] tracking-[-0.05em] text-fg">
          Written papers<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[700px] text-[17px] leading-relaxed text-fg-2 sm:text-[19px]">
          An exam paper for each week and side quest. Answer by hand, the way you would on a whiteboard: write, estimate and draw the diagram with a pencil, a finger or a
          mouse. Each answer is marked point by point against the paper&apos;s marking scheme, with the model answer and links back to the lessons.
        </p>
        <p className="m-0 font-mono text-xs text-fg-3">
          {papers.length} paper{papers.length === 1 ? "" : "s"} · practice untimed or sit it as a timed exam · graded by AI on your daily credits
        </p>
      </header>
      <PapersIndex papers={papers} />
    </main>
  );
}
