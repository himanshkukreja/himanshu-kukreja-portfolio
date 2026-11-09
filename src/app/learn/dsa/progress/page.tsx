import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getBadgeDefs } from "@/lib/dsa/load";
import DsaBeltBadges from "@/components/dsa/rewards/DsaBeltBadges";

// /dsa/progress: Belt & badges. The badge definitions come from the world specs (ISR, refreshed with the content);
// the learner's Bits, belt and badges are computed in the browser from their synced progress. Staging only.

export const revalidate = 604800;

export const metadata: Metadata = {
  title: "Belt & badges · DSA Mastery",
  description: "Your DSA Mastery belt, Bits, mastery badges and the weekly leaderboard.",
  robots: { index: false, follow: false },
};

export default async function DsaProgressPage() {
  if (!DSA_FULL) notFound();
  const defs = await getBadgeDefs().catch(() => null);
  return <DsaBeltBadges defs={defs} />;
}
