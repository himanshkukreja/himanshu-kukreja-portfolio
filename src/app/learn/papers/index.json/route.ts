import { NextResponse } from "next/server";
import { getPaperSummaries } from "@/lib/learn/papers/load";
import type { PaperIndexEntry } from "@/lib/learn/papers/types";

export const runtime = "nodejs";
// Static and cached like the papers themselves (1 h, refreshed with the course): the course map and lesson pages read
// it in the browser to show a "Written paper" card only where a paper exists, at no CPU cost per view.
export const revalidate = 3600;

/** GET /learn/papers/index.json → the papers that exist: key, title, marks, minutes, owner (week or quest). */
export async function GET() {
  const list: PaperIndexEntry[] = (await getPaperSummaries()).map(({ key, title, minutes, marks, kind, code, label, week, href, questions }) => ({ key, title, minutes, marks, kind, code, label, week, href, questions }));
  return NextResponse.json(list, { headers: { "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400" } });
}
