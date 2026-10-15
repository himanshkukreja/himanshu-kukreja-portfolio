import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { apiError } from "@/lib/campaigns/api";
import { getStore, type MessageFilter } from "@/lib/campaigns/store";
import { displayStatus } from "@/lib/campaigns/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const FILTERS: MessageFilter[] = ["all", "queued", "sending", "sent", "failed", "skipped", "opened", "clicked", "unopened", "unsubscribed"];
const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; // no spreadsheet formulas
  return `"${safe.replace(/"/g, '""')}"`;
};

/** GET ?filter=&q=&offset=&limit= → per-recipient rows; &format=csv → the whole filtered list as CSV. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const { id } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const filter = (FILTERS.includes(sp.get("filter") as MessageFilter) ? sp.get("filter") : "all") as MessageFilter;
    const q = (sp.get("q") || "").slice(0, 100);
    const store = getStore();
    if (sp.get("format") === "csv") {
      const lines = [["email", "name", "status", "sent_at", "opens", "first_open_at", "last_open_at", "clicks", "first_click_at", "last_click_at", "unsubscribed_at", "error"].join(",")];
      for (let offset = 0; offset < 200_000; offset += 1000) {
        const { rows } = await store.listMessages(id, { filter, q, limit: 1000, offset });
        for (const r of rows)
          lines.push([r.email, r.name, displayStatus(r), r.sentAt, r.openCount, r.firstOpenAt, r.lastOpenAt, r.clickCount, r.firstClickAt, r.lastClickAt, r.unsubscribedAt, r.error].map(csvCell).join(","));
        if (rows.length < 1000) break;
      }
      return new NextResponse(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
    }
    const limit = Math.min(Math.max(Number(sp.get("limit")) || 50, 1), 200);
    const offset = Math.max(Number(sp.get("offset")) || 0, 0);
    const { rows, total } = await store.listMessages(id, { filter, q, limit, offset });
    return NextResponse.json({ rows, total, offset, limit }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return apiError(e);
  }
}
