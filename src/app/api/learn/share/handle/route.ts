import { NextResponse } from "next/server";
import { handleProblem, HANDLE_MESSAGES } from "@/lib/share/handle";
import { settingsForHandle, shareLearner } from "@/lib/share/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/learn/share/handle?h=… — is this handle valid and free for me? (signed in only) */
export async function GET(request: Request) {
  const me = await shareLearner(request);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const h = (new URL(request.url).searchParams.get("h") || "").trim().toLowerCase();
  const problem = handleProblem(h);
  if (problem) return NextResponse.json({ ok: false, problem, message: HANDLE_MESSAGES[problem] }, { headers: { "Cache-Control": "no-store" } });
  const owner = await settingsForHandle(h).catch(() => null);
  const taken = !!owner && owner.userId !== me.id;
  return NextResponse.json(taken ? { ok: false, problem: "taken", message: "That handle is taken. Try another." } : { ok: true }, { headers: { "Cache-Control": "no-store" } });
}
