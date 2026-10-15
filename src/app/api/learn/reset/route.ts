import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { resetLearnerData } from "@/lib/learn/reset";
import { getCourseMap } from "@/lib/learn/course";
import { parseParts, parseScope, scopeCtx, stripGame } from "@/components/learn/progress/scope";
import { isMissing, noStore, requireLearner } from "../_lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/learn/reset  { scope: ResetScope, parts: ResetParts }
 * Resets the signed-in learner's OWN data (user id from the verified token, never the body).
 * Besides the tables, the course's keys in user_profiles.game_done (when the column exists) are
 * dropped for the parts being reset, so the game sync can't merge a reset lesson back in.
 * The browser clears its own caches (hk.lesson.v1, hk.game.v1, …) after this succeeds.
 */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;

  const body = (await request.json().catch(() => null)) as { scope?: unknown; parts?: unknown } | null;
  const scope = parseScope(body?.scope);
  if (!scope) return NextResponse.json({ error: "Invalid scope" }, { status: 400, headers: noStore });
  const parts = parseParts(body?.parts, scope.kind);
  if (!parts) return NextResponse.json({ error: "Choose what to reset" }, { status: 400, headers: noStore });

  try {
    const { deleted } = await resetLearnerData(me.id, scope, parts);

    // game_done keys that belong to the reset parts (the full game wipe is handled by resetLearnerData)
    if ((parts.progress || parts.mcq) && !(scope.kind === "all" && parts.game)) {
      const map = scope.kind === "all" ? await getCourseMap().catch(() => null) : await getCourseMap(scope.course).catch(() => null);
      const { data, error } = await supabase.from("user_profiles").select("xp, game_done, game_flags").eq("id", me.id).maybeSingle();
      if (map && !error && data) {
        const row = data as { xp: number | null; game_done: Record<string, number> | null; game_flags: Record<string, unknown> | null };
        const res = stripGame(row.game_done || {}, scopeCtx(map), scope, parts);
        if (res.dropped.length) {
          const xp = Math.max(0, (Number(row.xp) || 0) - res.xp);
          // stamp the reset so stale game copies on other devices don't merge the keys back
          const game_flags = { ...(row.game_flags || {}), "sync:resetAt": Date.now() };
          const up = await supabase.from("user_profiles").update({ xp, game_done: res.done, game_flags }).eq("id", me.id);
          if (!up.error) {
            deleted.game_done = (deleted.game_done || 0) + res.dropped.length;
            deleted.game_xp = (deleted.game_xp || 0) + res.xp;
          }
        }
      } else if (error && !isMissing(error)) {
        console.error("[learn/reset] game_done read failed:", error.message);
      }
    }
    return NextResponse.json({ ok: true, scope, parts, deleted }, { headers: noStore });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Reset failed";
    console.error("[learn/reset]", msg);
    return NextResponse.json({ error: msg }, { status: 500, headers: noStore });
  }
}
