import { NextResponse } from "next/server";
import { DSA_FULL } from "@/lib/dsa/flags";
import { getProblemIndex, getWorld } from "@/lib/dsa/load";
import type { Outline } from "@/lib/dsa/onboarding/recommend";

/**
 * GET /api/dsa/onboarding → the Academy outline the onboarding's 7-day plan is built from: every region in campus order
 * with its required, built lessons, practice problems and checkpoints (id, title, href, a time estimate). Public and
 * the same for everyone, so cached at the edge for an hour. 404 in "soon" mode.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GUESS = { concept: 25, checkpoint: 15, easy: 15, medium: 25, hard: 40 } as const;

export async function GET() {
  if (!DSA_FULL) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const [spec, problems] = await Promise.all([getWorld("academy"), getProblemIndex().catch(() => [])]);
    if (!spec) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const mins = new Map(problems.map((p) => [p.id, p.minutes]));
    const body: Outline = {
      regions: spec.regions.map((r) => ({
        id: r.id,
        code: r.code,
        title: r.moduleTitle || r.title,
        nodes: r.stretches
          .flatMap((s) => s.nodes)
          .filter((n) => n.required && n.built && !!n.href && (n.type === "concept" || n.type === "practice" || n.type === "checkpoint"))
          .map((n) => ({
            id: n.id,
            type: n.type as "concept" | "practice" | "checkpoint",
            title: n.title,
            href: n.href as string,
            minutes: n.type === "concept" ? GUESS.concept : n.type === "checkpoint" ? GUESS.checkpoint : (n.ref && mins.get(n.ref)) || GUESS[n.level || "medium"],
          })),
      })),
    };
    return NextResponse.json(body, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200", "x-robots-tag": "noindex" } });
  } catch (e) {
    console.error("[dsa-onboarding]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The outline is unavailable just now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
