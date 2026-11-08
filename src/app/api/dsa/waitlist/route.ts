import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getLearner, isMissing } from "@/app/api/learn/_lib/auth";
import { checkEmail, cleanGoals, cleanLanguages, cleanRef, cleanSource, type WaitlistResult, type WaitlistStatus } from "@/lib/dsa/waitlist";
import { allowRead, allowSignup, requestIp, sendWaitlistConfirmation } from "@/lib/dsa/waitlist-server";

/**
 * DSA Mastery waitlist (the coming-soon page at /dsa).
 *
 *   POST { email, goals?, languages?, source?, ref?, website? }  join; signed-in callers (Bearer token) are linked
 *   GET                                                          signed-in only: is this account on the list?
 *
 * Writes go through the service role; the table has RLS on and no client write policies. `website` is a
 * honeypot field the form hides from people: a filled one gets a quiet success and no row. Founding status
 * is set by the database (dsa_waitlist.founding: joined while the dsa product's free window is open), and a
 * signed-in caller gets their founding grants right away (grant_founding_access).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers: NO_STORE });
const CLOSED = "The waitlist isn't open just yet. Please try again a little later.";
const BROKEN = "We couldn't add you just now. Please try again in a minute.";

type Row = { id: number; email: string; user_id: string | null; founding: boolean; goals: string[]; languages: string[] };

export async function POST(req: Request) {
  if (!allowSignup(requestIp(req))) return fail(429, "Too many tries from this network. Please wait a few minutes and try again.");

  let body: Record<string, unknown> = {};
  try {
    const v = await req.json();
    if (v && typeof v === "object" && !Array.isArray(v)) body = v as Record<string, unknown>;
  } catch {
    return fail(400, "Enter your email address.");
  }

  const checked = checkEmail(body.email);
  if (!checked.ok) return fail(400, checked.error);
  const email = checked.email;

  // a bot filled the hidden field: look successful, store nothing
  if (typeof body.website === "string" && body.website.trim()) {
    return NextResponse.json({ ok: true, status: "joined", linked: false, founding: false, message: "You're on the list." } satisfies WaitlistResult, { headers: NO_STORE });
  }

  const goals = cleanGoals(body.goals);
  const languages = cleanLanguages(body.languages);
  const source = cleanSource(body.source);
  const ref = cleanRef(body.ref);
  const me = await getLearner(req);

  try {
    const { data: existing, error: readErr } = await supabase
      .from("dsa_waitlist")
      .select("id, email, user_id, founding, goals, languages")
      .eq("email", email)
      .maybeSingle<Row>();
    if (readErr) throw readErr;

    let row: Row;
    let status: WaitlistResult["status"];
    if (existing) {
      // already on the list: link the account, add any new interests, and clear an old unsubscribe
      const patch: Record<string, unknown> = { unsubscribed_at: null };
      if (me && !existing.user_id) patch.user_id = me.id;
      if (goals.length) patch.goals = [...new Set([...(existing.goals || []), ...goals])];
      if (languages.length) patch.languages = [...new Set([...(existing.languages || []), ...languages])];
      const { data, error } = await supabase.from("dsa_waitlist").update(patch).eq("id", existing.id).select("id, email, user_id, founding, goals, languages").single<Row>();
      if (error) throw error;
      row = data;
      status = "already";
    } else {
      const { data, error } = await supabase
        .from("dsa_waitlist")
        .insert({ email, user_id: me?.id ?? null, source, ref, goals, languages })
        .select("id, email, user_id, founding, goals, languages")
        .single<Row>();
      if (error?.code === "23505") {
        // a double submit raced us: the other request made the row
        const again = await supabase.from("dsa_waitlist").select("id, email, user_id, founding, goals, languages").eq("email", email).single<Row>();
        if (again.error) throw again.error;
        row = again.data;
        status = "already";
      } else {
        if (error) throw error;
        row = data;
        status = "joined";
      }
    }

    // a signed-in learner joining while the window is open: their founding grants now, not at launch
    if (me && row.founding) {
      const { error } = await supabase.rpc("grant_founding_access", { p_user: me.id, p_source: "dsa-waitlist" });
      if (error) console.error("[dsa-waitlist] founding grant failed:", error.message);
    }

    if (status === "joined") {
      const sent = await sendWaitlistConfirmation(email, row.founding);
      if (sent) await supabase.from("dsa_waitlist").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", row.id);
    }

    const linked = !!me && row.user_id === me.id;
    const message =
      status === "joined"
        ? row.founding
          ? "You're on the list, and you're a founding member."
          : "You're on the list. We'll email you when DSA Mastery opens."
        : "You're already on the list. We'll email you when DSA Mastery opens.";
    return NextResponse.json({ ok: true, status, linked, founding: row.founding, message } satisfies WaitlistResult, { headers: NO_STORE });
  } catch (e) {
    const err = e as { code?: string; message?: string; details?: string | null };
    if (isMissing(err)) return fail(503, CLOSED);
    console.error("[dsa-waitlist] write failed:", err?.message || e);
    return fail(500, BROKEN);
  }
}

export async function GET(req: Request) {
  if (!allowRead(requestIp(req))) return fail(429, "Too many requests. Please wait a minute.");
  const me = await getLearner(req);
  if (!me) return NextResponse.json({ joined: false, founding: false } satisfies WaitlistStatus, { headers: NO_STORE });
  try {
    const [byUser, byEmail, grants] = await Promise.all([
      supabase.from("dsa_waitlist").select("founding").eq("user_id", me.id).limit(1),
      me.email ? supabase.from("dsa_waitlist").select("founding").eq("email", me.email.toLowerCase()).limit(1) : Promise.resolve({ data: [], error: null }),
      supabase.from("course_access_grants").select("id").eq("user_id", me.id).eq("product", "dsa").eq("kind", "founding").is("revoked_at", null).limit(1),
    ]);
    if (byUser.error) throw byUser.error;
    const rows = [...(byUser.data || []), ...(byEmail.data || [])] as { founding: boolean }[];
    const joined = rows.length > 0;
    const founding = rows.some((r) => r.founding) || (grants.data || []).length > 0;
    return NextResponse.json({ joined, founding } satisfies WaitlistStatus, { headers: NO_STORE });
  } catch (e) {
    if (!isMissing(e as { code?: string })) console.error("[dsa-waitlist] status read failed:", (e as Error)?.message || e);
    return NextResponse.json({ joined: false, founding: false } satisfies WaitlistStatus, { headers: NO_STORE });
  }
}
