import { NextResponse } from "next/server";
import { noStore, requireLearner } from "@/app/api/learn/_lib/auth";
import { shareToken, SLUG_RE, verifyShare } from "@/lib/learn/lecture/share";

export const runtime = "nodejs";

/** POST { lecture } (signed in) → { token }: the learner's public share token for this lecture. */
export async function POST(request: Request) {
  const me = await requireLearner(request);
  if (me instanceof NextResponse) return me;
  const { lecture } = (await request.json().catch(() => ({}))) as { lecture?: string };
  if (!lecture || !SLUG_RE.test(lecture)) return NextResponse.json({ error: "Unknown lecture" }, { status: 400, headers: noStore });
  return NextResponse.json({ token: shareToken(lecture, me.id) }, { headers: noStore });
}

/** GET ?lecture=&s= → { ok }: is this a real share link for this lecture? (public; cacheable per URL) */
export async function GET(request: Request) {
  const u = new URL(request.url);
  const { ok } = verifyShare(u.searchParams.get("lecture") || "", u.searchParams.get("s") || "");
  return NextResponse.json({ ok }, { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
