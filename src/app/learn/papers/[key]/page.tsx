import { notFound } from "next/navigation";
import { getPaper } from "@/lib/learn/papers/load";
import PaperApp from "@/components/learn/papers/PaperApp";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed hourly and on every content push; the attempt, the answer sheets
// and the grades are the learner's and load in the browser.
export const revalidate = 3600;
export const dynamicParams = true;
/** None at build: each paper renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props) {
  const p = await getPaper((await params).key);
  if (!p) return { title: "Not Found" };
  const title = `${p.title} · System Design Mastery`;
  const description = `${p.questions.length} questions, ${p.marks} marks, ${p.minutes} minutes. Answer by hand with handwriting and diagrams; each answer is graded against the marking scheme.`;
  return { title, description, alternates: { canonical: p.href }, robots: { index: true, follow: true } };
}

export default async function PaperPage({ params }: Props) {
  const paper = await getPaper((await params).key);
  if (!paper) notFound();
  return <PaperApp paper={paper} />;
}
