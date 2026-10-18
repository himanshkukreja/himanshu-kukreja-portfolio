import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SubmissionView from "@/components/learn/design-week/SubmissionView";
import { loadSubmission } from "@/lib/design-week/server";
import { dowFixtures } from "@/lib/design-week/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string; id: string }> };

const ok = (slug: string, id: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && /^[0-9a-f-]{36}$/i.test(id);

/** Only public designs (submitted, from voting on) have a page; everything else is the same 404. */
async function load(slug: string, id: string) {
  if (!ok(slug, id)) return null;
  return loadSubmission(slug, id).catch(() => null);
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, id } = await params;
  const d = await load(slug, id);
  if (!d) return { title: "Design of the week", robots: { index: false } };
  const who = d.submission.author.anonymous ? "a learner" : d.submission.author.name || `@${d.submission.author.handle}`;
  return {
    title: `${d.submission.title} · ${d.challenge.title}`,
    description: `A design by ${who} for "${d.challenge.title}", Design of the week on System Design Mastery. ${d.submission.excerpt}`.slice(0, 300),
    alternates: { canonical: `/learn/design-week/${slug}/${id}` },
    robots: { index: d.challenge.phase === "closed", follow: true },
  };
}

export default async function SubmissionRoute({ params }: Params) {
  const { slug, id } = await params;
  const d = await load(slug, id);
  if (!d) notFound();
  return <SubmissionView data={d} dev={dowFixtures()} />;
}
