import type { Metadata } from "next";
import DesignWeekHome from "@/components/learn/design-week/DesignWeekHome";
import { loadHome } from "@/lib/design-week/server";
import { dowFixtures } from "@/lib/design-week/store";

export const runtime = "nodejs";
// Rendered once and served from the cache, refreshed every 5 minutes (state changes over time) and on save; per-visitor state (progress, notes, sign-in) loads on the client.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Design of the week · System Design Mastery",
  description: "One open system design problem a week. Submit your design with diagrams, vote on the community's, and get featured with your profile. Free.",
  alternates: { canonical: "/learn/design-week" },
};

export default async function DesignWeekPage() {
  const data = await loadHome().catch((e) => {
    console.error("[design-week] home", e instanceof Error ? e.message : e);
    return { available: false } as const;
  });
  return <DesignWeekHome data={data} dev={dowFixtures()} />;
}
