import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getPracticeData } from "@/lib/dsa/practice-load";
import SharedListPage from "@/components/dsa/practice/SharedListPage";

// /dsa/lists/shared#<code>: a list someone shared, read-only. The list is encoded in the link's fragment (nothing is stored on
// a server, and the fragment never reaches one); the page only needs the bank's rows to show the problems.

export const revalidate = 604800;

export const metadata: Metadata = { title: "Shared list · DSA Mastery", alternates: { canonical: "/dsa/lists/shared" }, robots: { index: false, follow: false } };

export default async function SharedPage() {
  if (!DSA_FULL) notFound();
  const { data } = await getPracticeData();
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1000px] flex-col gap-5 px-4 pb-24 pt-6 sm:px-6">
        <SharedListPage data={data} />
      </main>
    </div>
  );
}
