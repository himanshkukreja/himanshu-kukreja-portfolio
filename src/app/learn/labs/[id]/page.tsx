import { notFound } from "next/navigation";
import { getLab, getLabSummaries } from "@/lib/learn/labs/load";
import LabRoom from "@/components/learn/labs/LabRoom";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed daily and on every content push (revalidate-courses / publish); per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 86400;
export const dynamicParams = true;
/** None at build: each path renders on its first visit, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const lab = await getLab(id);
  if (!lab) return { title: "Not Found" };
  return {
    title: `${lab.title} · Code lab · System Design Mastery`,
    description: `${lab.summary || lab.title} A free in-browser Python lab: ${lab.tests.visible + lab.tests.hidden} tests, ~${lab.minutes} min, no install.`,
  };
}

export default async function LabPage({ params }: Props) {
  const { id } = await params;
  const [lab, all] = await Promise.all([getLab(id), getLabSummaries()]);
  if (!lab) notFound();
  const i = all.findIndex((l) => l.id === lab.id);
  const link = (k: number) => (k >= 0 && k < all.length ? { href: all[k].href, title: all[k].title } : null);
  return <LabRoom lab={lab} prev={link(i - 1)} next={link(i + 1)} />;
}
