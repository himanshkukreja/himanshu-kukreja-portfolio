import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { isMissing, noStore, requireLearner } from "@/app/api/learn/_lib/auth";
import { supabase } from "@/lib/supabase";
import { SLUG_RE } from "@/lib/learn/lecture/share";

export const runtime = "nodejs";

/** GET (signed in) → { voted: lecture ids this learner upvoted } */
export async function GET(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const { data, error } = await supabase.from("lecture_votes").select("lecture_id").eq("user_id", me.id).limit(1000);
  if (error) return NextResponse.json({ voted: [], error: isMissing(error) ? "not set up" : "read failed" }, { headers: noStore });
  return NextResponse.json({ voted: (data || []).map((r) => r.lecture_id as string) }, { headers: noStore });
}

/** POST { lecture, up } (signed in) → { up, votes }: one upvote per learner per lecture */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const { lecture, up } = (await request.json().catch(() => ({}))) as { lecture?: string; up?: boolean };
  if (!lecture || !SLUG_RE.test(lecture)) return NextResponse.json({ error: "Unknown lecture" }, { status: 400, headers: noStore });
  const q = up
    ? supabase.from("lecture_votes").upsert({ lecture_id: lecture, user_id: me.id }, { onConflict: "lecture_id,user_id", ignoreDuplicates: true })
    : supabase.from("lecture_votes").delete().eq("lecture_id", lecture).eq("user_id", me.id);
  const { error } = await q;
  if (error) return NextResponse.json({ error: "Couldn't save your vote" }, { status: 500, headers: noStore });
  const { count } = await supabase.from("lecture_votes").select("lecture_id", { count: "exact", head: true }).eq("lecture_id", lecture);
  revalidateTag("lecture-stats");
  return NextResponse.json({ up: !!up, votes: count ?? 0 }, { headers: noStore });
}
