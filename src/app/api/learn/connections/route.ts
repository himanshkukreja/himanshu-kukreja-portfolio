import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { loadConnections, type ConnectionAsk } from "@/lib/learner/planning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const noStore = { "Cache-Control": "private, no-store" };

/**
 * GET /api/learn/connections?page=sdm:<week>/<slug> | dsa-concept:<id> | dsa-problem:<id> → { items: Connection[] }
 * The "Connected to what you've done" lines for a System Design lesson or LLD case study, a DSA Mastery lesson or a DSA
 * problem: deterministic (lib/learner/connections-model.ts), from the content's own cross-course links and the learner's
 * progress. Signed-in learners only; an empty list hides the panel.
 */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const page = new URL(request.url).searchParams.get("page") || "";
  const m = page.match(/^(sdm|dsa-concept|dsa-problem):([a-z0-9][\w./-]{0,200})$/i);
  if (!m) return NextResponse.json({ error: "Bad page" }, { status: 400, headers: noStore });
  const ask: ConnectionAsk = m[1] === "sdm" ? { kind: "sdm", key: m[2] } : m[1] === "dsa-concept" ? { kind: "dsa-concept", id: m[2] } : { kind: "dsa-problem", id: m[2] };
  const items = await loadConnections(me.id, ask).catch((e) => (console.warn("[connections]", (e as Error).message), []));
  return NextResponse.json({ items }, { headers: noStore });
}
