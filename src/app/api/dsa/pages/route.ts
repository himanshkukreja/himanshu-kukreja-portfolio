import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getConceptIndex, getProblemIndex, lessonHref, problemHref } from "@/lib/dsa/load";

/**
 * GET /api/dsa/pages → { paths }: every cached DSA Mastery page, for the warm-up after a deploy or a content release
 * (scripts/cf/warm.mjs): the hubs, every written lesson (concept, structure and algorithm) and every problem, from the
 * indexes (the content bundle: no per-file reads). /dsa/daily is left out (rendered per request). 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HUBS = ["/dsa", "/dsa/problems", "/dsa/lectures", "/dsa/cheatsheets", "/dsa/shorts", "/dsa/ask", "/dsa/complexity", "/dsa/progress", "/dsa/revise", "/dsa/stats", "/dsa/certificate"];

export async function GET() {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const [concepts, problems] = await Promise.all([getConceptIndex(), getProblemIndex()]);
    const lessons = concepts.filter((c) => c.status === "built").map((c) => lessonHref(c));
    const paths = [...new Set([...HUBS, ...lessons, ...problems.map((p) => problemHref(p.id))])];
    return NextResponse.json({ paths, lessons: lessons.length, problems: problems.length }, { headers: { "Cache-Control": "no-store", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error("[dsa-pages]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
