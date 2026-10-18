import { getRevisionWeek } from "@/lib/learn/revision/load";
import { revisionCard } from "@/lib/og/revision-card";

export const runtime = "nodejs";
export const alt = "A one-page System Design Mastery cheat sheet, a free course by Himanshu Kukreja";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;

type Params = { week: string };

export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const { week } = await params;
  return revisionCard(await getRevisionWeek(week).catch(() => null), "cheatsheet");
}
