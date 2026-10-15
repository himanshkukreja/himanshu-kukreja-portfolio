import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { buildAudience } from "@/lib/announce/audience";
import { ANNOUNCE_KEY, ANNOUNCE_SUBJECT } from "@/lib/announce/learn-revamp";
import { MAX_BATCH, SEND_GAP_MS, smtpReady, transportKind } from "@/lib/announce/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET → audience counts for the learn-revamp announcement (read-only). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const a = await buildAudience();
    const sample = (list: { email: string }[]) => list.slice(0, 5).map((r) => r.email);
    return NextResponse.json({
      key: ANNOUNCE_KEY,
      subject: ANNOUNCE_SUBJECT,
      admin: admin.email,
      transport: transportKind(),
      smtpReady: smtpReady(),
      batch: { size: MAX_BATCH, gapMs: SEND_GAP_MS },
      counts: { learners: a.learners.length, all: a.all.length },
      totals: a.totals,
      samples: { learners: sample(a.learners), all: sample(a.all) },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build audience" }, { status: 500 });
  }
}
