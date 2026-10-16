import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { getCourseMap } from "@/lib/learn/course";
import { isValidHandle } from "@/lib/share/handle";
import { COURSE_NAME } from "@/lib/share/model";
import { getPublicProfile } from "@/lib/share/stats";
import PublicProfile from "@/components/share/PublicProfile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ handle: string }> };

/** Unknown, unpublished or invalid handles are all the same 404 (no way to probe who has a page). */
async function load(raw: string) {
  const h = decodeURIComponent(raw);
  if (isValidHandle(h.toLowerCase()) && h !== h.toLowerCase()) permanentRedirect(`/u/${h.toLowerCase()}`);
  if (!isValidHandle(h)) return null;
  return getPublicProfile(h).catch((e) => {
    console.error("[share] profile", e instanceof Error ? e.message : e);
    return null;
  });
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { handle } = await params;
  const p = await load(handle);
  if (!p) notFound();
  const who = p.name || `@${p.handle}`;
  const bits = [p.level ? `${p.level.code} ${p.level.name}` : null, p.course && p.level ? `${p.course.pct}% through ${COURSE_NAME}` : `learning ${COURSE_NAME}`].filter(Boolean).join(" · ");
  const title = `${who} · ${bits}`;
  const description = `${who}'s level, skill tree, streak and Arena scores on ${COURSE_NAME}, the free system design course. Start it and try to beat them.`;
  return {
    title,
    description,
    alternates: { canonical: `/u/${p.handle}` },
    robots: { index: false, follow: true },
    openGraph: { title, description, url: `/u/${p.handle}`, type: "profile" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedProfilePage({ params }: Params) {
  const { handle } = await params;
  const [p, map] = await Promise.all([load(handle), getCourseMap()]);
  if (!p || !map) notFound();
  return <PublicProfile p={p} map={map} />;
}
