import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getProblem } from "@/lib/dsa/load";
import ProblemRoom from "@/components/dsa/problem/ProblemRoom";

// A DSA Mastery problem (/dsa/problems/<id>): the statement and hints from the content repo, cached (ISR, refreshed on
// content sync); the editor, the browser judge, the editorial (fetched after a solve) and progress run on the client.
// Staging only until launch.

export const revalidate = 604800;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!DSA_FULL) return { title: "Not found" };
  const { id } = await params;
  const p = await getProblem(id).catch(() => null);
  if (!p) return { title: "Not found" };
  return { title: `${p.title} · DSA Mastery`, alternates: { canonical: `/dsa/problems/${p.id}` }, robots: { index: false, follow: false } };
}

export default async function ProblemPage({ params }: Props) {
  if (!DSA_FULL) notFound();
  const { id } = await params;
  const p = await getProblem(id);
  if (!p) notFound();
  return (
    <div className="dsa-theme">
      <main>
        <ProblemRoom p={p} />
      </main>
    </div>
  );
}
