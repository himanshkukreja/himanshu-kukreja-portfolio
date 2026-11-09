import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { listDsaShorts } from "@/lib/dsa/media";
import { hourlyOrder } from "@/lib/learn/shorts/load";
import ShortsFeed from "@/components/learn/war/ShortsFeed";

// /dsa/shorts: DSA Mastery's vertical shorts in SD Mastery's swipe feed (one idea each, linked to the concept's lecture
// at that moment and to its lesson). Only shorts whose recorded video matches their script are listed. Staging only.

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Shorts · DSA Mastery",
  description: "DSA in two-minute vertical videos: one idea each, from the course's concepts, each linked to its full lecture and lesson.",
  alternates: { canonical: "/dsa/shorts" },
  robots: { index: false, follow: false },
};

export default async function DsaShortsPage() {
  if (!DSA_FULL) notFound();
  const shorts = await listDsaShorts().catch(() => []);
  return (
    <div className="dsa-theme">
      <ShortsFeed shorts={hourlyOrder(shorts)} home="/dsa" shareBase="/dsa/shorts" guide={false} />
    </div>
  );
}
