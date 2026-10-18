import { NextResponse } from "next/server";
import { deleteOwnSubmission, saveSubmission } from "@/lib/design-week/core";
import { getStore } from "@/lib/design-week/store";
import { dowError, guardWrite, NO_STORE, rateLimit, readJson, requireDowLearner } from "@/lib/design-week/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** PUT { title, bodyMd, showAuthor, action: "save" | "submit" | "withdraw", baseUpdatedAt }: autosave / submit my design. */
export async function PUT(req: Request, { params }: Ctx) {
  try {
    guardWrite(req);
    const me = await requireDowLearner(req);
    rateLimit("save", me.id);
    const { slug } = await params;
    const { submission, first } = await saveSubmission(getStore(), me, slug, await readJson(req));
    return NextResponse.json(
      {
        first,
        submission: {
          id: submission.id,
          title: submission.title,
          bodyMd: submission.bodyMd,
          status: submission.status,
          showAuthor: submission.showAuthor,
          updatedAt: submission.updatedAt,
          submittedAt: submission.submittedAt,
          moderationNote: submission.moderationNote,
        },
      },
      { headers: NO_STORE }
    );
  } catch (e) {
    return dowError(e);
  }
}

/** DELETE: discard my design (only while submissions are open). */
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const me = await requireDowLearner(req);
    rateLimit("save", me.id);
    const { slug } = await params;
    await deleteOwnSubmission(getStore(), me, slug);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    return dowError(e);
  }
}
