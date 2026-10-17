import { NextResponse } from "next/server";
import { getOfflineCatalog } from "@/lib/offline/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What can be saved for offline reading, with content versions and size estimates. */
export async function GET(req: Request) {
  const course = new URL(req.url).searchParams.get("course") || undefined;
  const catalog = await getOfflineCatalog(course);
  if (!catalog) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(catalog, { headers: { "Cache-Control": "public, max-age=0, s-maxage=60, stale-while-revalidate=300" } });
}
