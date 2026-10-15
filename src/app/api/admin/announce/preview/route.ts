import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { learnRevampEmail } from "@/lib/announce/learn-revamp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET ?format=html|text&name=… → the exact email a recipient gets (rendered for the admin's address). */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const format = req.nextUrl.searchParams.get("format") === "text" ? "text" : "html";
  const name = (req.nextUrl.searchParams.get("name") || "").slice(0, 80) || null;
  const mail = learnRevampEmail({ email: admin.email, name });
  return new NextResponse(format === "text" ? mail.text : mail.html, {
    headers: { "Content-Type": format === "text" ? "text/plain; charset=utf-8" : "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
