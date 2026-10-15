import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError } from "@/lib/campaigns/api";
import { listSenders } from "@/lib/campaigns/engine";
import { allTransports } from "@/lib/campaigns/senders";
import { getStore } from "@/lib/campaigns/store";
import { parseSender } from "./parse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET → env + stored senders with verification checks; POST → add a sender. */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { senders, dbError } = await listSenders();
    return NextResponse.json({ senders, transports: allTransports(), dbError });
  } catch (e) {
    return apiError(e);
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const s = parseSender(await req.json().catch(() => ({})));
    const saved = await getStore().saveSender(s);
    return NextResponse.json({ sender: saved });
  } catch (e) {
    return apiError(e);
  }
}
