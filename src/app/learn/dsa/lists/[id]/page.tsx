import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getPracticeData } from "@/lib/dsa/practice-load";
import ListPage from "@/components/dsa/practice/ListPage";

// /dsa/lists/<id>: one of the learner's own lists. The page is ISR (the bank's rows, refreshed with the content); the list itself
// is the learner's (this device, or the account when signed in) and loads in the browser, like Saved.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export const metadata: Metadata = { title: "My list · DSA Mastery", robots: { index: false, follow: false } };

export default async function MyListPage({ params }: { params: Promise<{ id: string }> }) {
  if (!DSA_FULL) notFound();
  const { id } = await params;
  if (!/^[a-z0-9]{4,16}$/.test(id)) notFound();
  const { data } = await getPracticeData();
  return (
    <div className="dsa-theme">
      <main className="mx-auto flex max-w-[1000px] flex-col gap-5 px-4 pb-24 pt-6 sm:px-6">
        <ListPage id={id} data={data} />
      </main>
    </div>
  );
}
