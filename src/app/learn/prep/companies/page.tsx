import Link from "next/link";
import { getCompanies } from "@/lib/learn/prep/load";
import CompanyGrid from "@/components/learn/prep/CompanyGrid";

export const runtime = "nodejs";
export const revalidate = 86400;

export const metadata = {
  title: "Companies · Interview prep · System Design Mastery",
  description:
    "System design and machine coding interview prep by company: questions candidates reported (with sources), questions that fit what each company builds, and the free lessons that teach them.",
  alternates: { canonical: "/learn/prep/companies" },
};

export default async function CompaniesPage() {
  const companies = await getCompanies();
  const reported = companies.reduce((a, c) => a + c.reported, 0);
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-8 px-4 pb-28 pt-6 sm:px-6 sm:pt-14">
      <header className="flex flex-col gap-4">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-label text-fg-3">
          <Link href="/learn/prep" className="hover:text-fg">
            Prep
          </Link>
          <span aria-hidden>/</span>
          <span className="text-signal-text">Companies</span>
        </nav>
        <h1 className="m-0 font-display text-[clamp(44px,8vw,88px)] font-extrabold leading-[0.9] tracking-[-0.05em] text-fg">
          Prep by company<span className="text-signal-text">.</span>
        </h1>
        <p className="m-0 max-w-[700px] text-[17px] leading-relaxed text-fg-2">
          What each company builds, the questions candidates have reported from its interviews (every one with its source), the ones that fit its products, and the lessons that teach them.
          No company publishes its questions; reports are what candidates wrote down.
        </p>
        <p className="m-0 font-mono text-xs text-fg-3">
          {companies.length} companies · {reported} reported questions with sources ·{" "}
          <Link href="/learn/prep/questions" className="text-signal-text underline underline-offset-4">
            the whole question bank →
          </Link>
        </p>
      </header>
      {companies.length ? <CompanyGrid companies={companies} /> : <p className="m-0 border border-dashed border-line p-5 text-fg-3">The company pages are being researched.</p>}
    </main>
  );
}
