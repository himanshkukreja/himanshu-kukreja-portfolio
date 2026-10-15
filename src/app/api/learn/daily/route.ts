import { NextResponse } from "next/server";
import { getDailySet } from "@/lib/learn/arena/daily";
import { addDays, istDate, isDay } from "@/lib/learn/arena/shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/learn/daily[?date=YYYY-MM-DD]
 * The day's challenge (Asia/Kolkata), the same five questions for everyone. Past days (up to 30 back)
 * are served for practice replays; the future is not. Public, cached for 5 minutes.
 */
export async function GET(request: Request) {
  const today = istDate();
  const asked = new URL(request.url).searchParams.get("date");
  const date = isDay(asked) ? asked : today;
  if (date > today || date < addDays(today, -30)) {
    return NextResponse.json({ error: "No challenge for that day" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const set = await getDailySet(date);
    if (!set.questions.length) return NextResponse.json({ error: "Question bank is empty" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ ...set, today }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
  } catch (e) {
    console.error("[daily]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Daily challenge unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
