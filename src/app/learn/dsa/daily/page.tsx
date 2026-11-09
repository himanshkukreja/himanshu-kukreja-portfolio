import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DSA_FULL } from "@/lib/dsa/flags";
import DsaDaily from "@/components/dsa/daily/DsaDaily";

// /dsa/daily: today's DSA problem, the daily streak and the last two weeks. The page is static; the day's pick
// (GET /api/dsa/daily) and the learner's streak load in the browser. Staging only.

export const metadata: Metadata = {
  title: "Daily problem · DSA Mastery",
  description: "One DSA problem a day, the same for everyone. Solve it the same day to keep your daily streak.",
  robots: { index: false, follow: false },
};

export default function DsaDailyPage() {
  if (!DSA_FULL) notFound();
  return <DsaDaily />;
}
