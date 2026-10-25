import Link from "next/link";
import { getCompanies, getQuestionBank } from "@/lib/learn/prep/load";
import QuestionBank from "@/components/learn/prep/QuestionBank";

export const runtime = "nodejs";
export const revalidate = 86400;

export const metadata = {
  title: "Question bank · Interview prep · System Design Mastery",
  description:
    "Every system design and machine coding question from our company pages in one list: which companies it was reported at (with sources), and the free lessons that teach it.",
  alternates: { canonical: "/learn/prep/questions" },
};

export default async function QuestionsPage() {
  const [bank, companies] = await Promise.all([getQuestionBank(), getCompanies()]);
  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-14">
      <header className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
          <Link href="/learn/prep" className="hover:text-fg">
            Prep
          </Link>
          <span aria-hidden>/</span>
          <span className="text-signal-text">Question bank</span>
        </nav>
        <h1 className="m-0 font-display text-[clamp(44px,8vw,88px)] font-extrabold leading-[0.9] tracking-[-0.05em] text-fg">
          Question bank<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[700px] text-[17px] leading-relaxed text-fg-2">
          Every question from the company pages, merged: the most-reported first. Each one links the lessons that teach it and the companies it comes from.
        </p>
      </header>
      {bank.length ? (
        <QuestionBank bank={bank} companies={companies.map((c) => ({ slug: c.slug, name: c.name }))} />
      ) : (
        <p className="m-0 border border-dashed border-line p-5 text-fg-3">The question bank is being researched.</p>
      )}
    </main>
  );
}
