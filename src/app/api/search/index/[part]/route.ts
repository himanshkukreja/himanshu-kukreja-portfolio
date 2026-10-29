import { NextResponse } from "next/server";
import { buildDocIndex, INDEX_PARTS, type IndexPart } from "@/lib/search/smart/build";

export const runtime = "nodejs";
// Smart search's document index, in three parts (a: core lessons and their sections; b: side quests,
// problems and LLD rounds and their sections; c: everything else, see lib/search/smart/build.ts).
// Built once and served from the cache (CDN), refreshed daily, on every content push
// (revalidate-courses) and when publishing controls change. Read by /api/search/smart and the AI
// route on the server; the page never downloads it.
export const revalidate = 86400;
export const dynamicParams = false;
export const maxDuration = 60;
export function generateStaticParams() {
  return INDEX_PARTS.map((part) => ({ part }));
}

export async function GET(_: Request, { params }: { params: Promise<{ part: string }> }) {
  const { part } = await params;
  if (!(INDEX_PARTS as readonly string[]).includes(part)) return NextResponse.json({ error: "Unknown part" }, { status: 404 });
  return NextResponse.json(await buildDocIndex(part as IndexPart));
}
