import { getRevisionWeek } from "@/lib/learn/revision/load";
import { revisionCard } from "@/lib/og/revision-card";

export const runtime = "nodejs";
export const alt = "Interview-night revision cards from System Design Mastery, a free course by Himanshu Kukreja";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400;
export const dynamicParams = true;
/** None at build: each image renders on its first request, then is cached (on-demand ISR). */
export function generateStaticParams() {
  return [];
}

type Params = { week: string };

export default async function Image({ params }: { params: Params | Promise<Params> }) {
  const { week } = await params;
  return revisionCard(await getRevisionWeek(week).catch(() => null), "deck");
}
