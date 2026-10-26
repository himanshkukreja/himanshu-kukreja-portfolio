import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { supabase } from "@/lib/supabase";
import { listLectures } from "@/lib/learn/lecture/load";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Row = { created_at: string; visitor_id: string | null; user_id: string | null; metadata: Record<string, unknown> | null };

/**
 * GET /api/admin/lectures?days=30 → video lecture watching across every viewer, from the
 * first-party events the player sends: lecture_play, lecture_watch { quest, sec, pct } (a beat every
 * ~30 s of playing and on pause / end / leaving) and lecture_complete.
 */
export async function GET(request: Request) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;
  const days = Math.min(180, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const rows: Row[] = [];
  for (let from = 0; from < 100_000; from += 1000) {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("created_at, visitor_id, user_id, metadata")
      .eq("event_type", "event")
      .filter("metadata->>name", "in", "(lecture_play,lecture_watch,lecture_complete)")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows.push(...((data || []) as Row[]));
    if (!data || data.length < 1000) break;
  }

  const lectures = await listLectures().catch(() => []);
  const meta = new Map(lectures.map((l) => [l.slug, l]));
  const day = (iso: string) => iso.slice(0, 10);
  const today = day(new Date().toISOString());
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const daily = new Map<string, { min: number; viewers: Set<string> }>();
  const per = new Map<string, { plays: number; sec: number; viewers: Set<string>; completes: number; last: string }>();
  const people = new Map<string, { user: string | null; sec: number; lectures: Set<string>; completes: number; last: string }>();
  const viewers = new Set<string>();
  const viewers7 = new Set<string>();
  let secAll = 0;
  let sec7 = 0;
  let secToday = 0;
  let completes = 0;
  let plays = 0;
  for (const r of rows) {
    const m = r.metadata || {};
    const name = String(m.name || "");
    const id = String(m.quest || "");
    const who = r.user_id || r.visitor_id || "anon";
    if (!id) continue;
    const p = per.get(id) || { plays: 0, sec: 0, viewers: new Set<string>(), completes: 0, last: r.created_at };
    const h = people.get(who) || { user: r.user_id, sec: 0, lectures: new Set<string>(), completes: 0, last: r.created_at };
    p.viewers.add(who);
    p.last = r.created_at;
    h.lectures.add(id);
    h.last = r.created_at;
    viewers.add(who);
    if (r.created_at >= weekAgo) viewers7.add(who);
    if (name === "lecture_play") {
      p.plays++;
      plays++;
    } else if (name === "lecture_complete") {
      p.completes++;
      h.completes++;
      completes++;
    } else {
      const sec = Math.max(0, Math.min(600, Number(m.sec) || 0));
      p.sec += sec;
      h.sec += sec;
      secAll += sec;
      if (r.created_at >= weekAgo) sec7 += sec;
      if (day(r.created_at) === today) secToday += sec;
      const d = daily.get(day(r.created_at)) || { min: 0, viewers: new Set<string>() };
      d.min += sec / 60;
      d.viewers.add(who);
      daily.set(day(r.created_at), d);
    }
    per.set(id, p);
    people.set(who, h);
  }

  // every day in the range, zeros included
  const series: { day: string; minutes: number; viewers: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = day(new Date(Date.now() - i * 86_400_000).toISOString());
    const d = daily.get(k);
    series.push({ day: k, minutes: Math.round((d?.min || 0) * 10) / 10, viewers: d?.viewers.size || 0 });
  }

  const top = [...people.entries()].sort((a, b) => b[1].sec - a[1].sec).slice(0, 30);
  const emails = new Map<string, string | null>();
  await Promise.all(
    top
      .filter(([, h]) => h.user)
      .map(async ([, h]) => {
        const { data } = await supabase.auth.admin.getUserById(h.user!).catch(() => ({ data: null }));
        emails.set(h.user!, data?.user?.email ?? null);
      })
  );

  return NextResponse.json({
    days,
    totals: { minutes: Math.round(secAll / 60), minutes7: Math.round(sec7 / 60), minutesToday: Math.round(secToday / 60), viewers: viewers.size, viewers7: viewers7.size, plays, completes, lectures: lectures.length },
    daily: series,
    lectures: [...per.entries()]
      .map(([id, p]) => ({
        id,
        title: meta.get(id)?.title || id,
        group: meta.get(id)?.group || "",
        href: meta.get(id)?.href || `/learn/lectures/${id}`,
        length: meta.get(id)?.minutes || null,
        plays: p.plays,
        viewers: p.viewers.size,
        minutes: Math.round((p.sec / 60) * 10) / 10,
        completes: p.completes,
        last: p.last,
      }))
      .sort((a, b) => b.minutes - a.minutes),
    learners: top.map(([who, h]) => ({ id: who, userId: h.user, email: h.user ? emails.get(h.user) ?? null : null, minutes: Math.round((h.sec / 60) * 10) / 10, lectures: h.lectures.size, completes: h.completes, last: h.last })),
  });
}
