import { NextResponse } from "next/server";
import { requireLearner } from "@/app/api/learn/_lib/auth";
import { deleteOutcomeRows, listOutcomeRows } from "@/lib/learner/events";
import { namerFor } from "@/lib/learner/feature-brief";
import type { OutcomeEvent } from "@/lib/learner/events-model";
import { deleteRequest, knownFromResults, type ViewRow } from "@/lib/learner/memory-view-model";
import { forgetReadiness } from "@/lib/learner/readiness";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const noStore = { "Cache-Control": "private, no-store" };

const humanise = (ref: string) => ref.replace(/^dsa:/, "").split("/")[0].replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const strip = (s: string | null) => (s ? s.replace(/^(explain-back on|lab|war room|paper|mock) /i, "") : null);

/**
 * The learner's graded results (table learner_events), for You -> Tutor memory:
 *   GET     → { available, rows: ViewRow[], known: KnownItem[] }   rows newest first, named from the course content;
 *             `known`: what the AI features take from them (lib/learner/memory-view-model.ts knownFromResults)
 *   DELETE  { ids: number[] } | { all: true } → { ok, deleted }    forget some or all, with the learner's own session
 *             (the table's delete policy keeps it to their rows: supabase/migrations/20261112_learner_events_delete.sql)
 * Only ever the caller's own rows (the user id comes from the verified session).
 */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const { available, rows } = await listOutcomeRows(me.id);
  // one event per graded thing is enough to name it (a mock's phases share its slug)
  const reps = new Map<string, OutcomeEvent>();
  for (const r of rows) {
    const k = r.kind === "mock_phase" || r.kind === "mock_overall" ? `mock|${r.ref.split("/")[0]}` : `${r.kind}|${r.ref}`;
    if (!reps.has(k)) reps.set(k, r.kind === "mock_phase" ? { ...r, kind: "mock_overall", ref: r.ref.split("/")[0] } : r);
  }
  const names = await Promise.race([namerFor([...reps.values()]), new Promise<null>((res) => setTimeout(() => res(null), 4000))]).catch(() => null);
  const view: ViewRow[] = rows.map((r) => ({
    id: r.id,
    course: r.course,
    kind: r.kind,
    ref: r.ref,
    outcome: r.outcome,
    detail: r.detail,
    at: r.at,
    name: strip(names?.ref(r) ?? null) ?? humanise(r.ref),
    part: r.kind === "mock_phase" ? (names?.item(r, r.ref.split("/").pop() ?? "") ?? null) : null,
  }));
  return NextResponse.json({ available, rows: view, known: knownFromResults(view, Date.now()) }, { headers: noStore });
}

export async function DELETE(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const token = (request.headers.get("authorization") || "").slice(7).trim();
  const what = deleteRequest(await request.json().catch(() => null));
  if (!what) return NextResponse.json({ error: "Say which results to forget" }, { status: 400, headers: noStore });
  try {
    const deleted = await deleteOutcomeRows(token, me.id, what);
    forgetReadiness(me.id);
    return NextResponse.json({ ok: true, deleted }, { headers: noStore });
  } catch (e) {
    console.warn("[learner] delete:", (e as Error).message);
    return NextResponse.json({ error: "Couldn't forget that just now. Try again." }, { status: 500, headers: noStore });
  }
}
