import { NextResponse } from "next/server";
import { DowError, LIMITS } from "@/lib/design-week/core";
import { renderDesign } from "@/lib/design-week/render";
import { dowError, guardWrite, NO_STORE, rateLimit, readJson, requireDowLearner } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { bodyMd }: the editor's live preview, through the same sanitizer + renderer as the public page. */
export async function POST(req: Request) {
  try {
    guardWrite(req);
    const me = await requireDowLearner(req);
    rateLimit("preview", me.id);
    const body = await readJson(req);
    const md = typeof body.bodyMd === "string" ? body.bodyMd : "";
    if (md.length > LIMITS.bodyMax * 1.25) throw new DowError(413, "invalid", "That's too long to preview.");
    const r = await renderDesign(md);
    return NextResponse.json({ html: r.html, warnings: r.warnings, diagrams: r.diagrams }, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
