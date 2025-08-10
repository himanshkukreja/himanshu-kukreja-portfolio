import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getVisitorId(req: NextRequest): { id: string; setCookie?: string } {
  const cookieName = "story_visitor_id";

  // 1) Prefer client-provided stable id to avoid race conditions creating 2 ids
  const headerId = req.headers.get("x-visitor-id")?.trim();
  if (headerId && /^[a-z0-9._-]{6,64}$/i.test(headerId)) {
    return { id: headerId };
  }

  // 2) Attempt to read from cookie
  const cookieHeader = req.headers.get("cookie") || "";
  const m = cookieHeader.match(new RegExp(`${cookieName}=([^;]+)`));
  if (m && m[1]) {
    return { id: decodeURIComponent(m[1]) };
  }

  // 3) Create a new pseudo-random visitor id (no PII)
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const maxAge = 60 * 60 * 24 * 365 * 2; // 2 years
  const isProd = process.env.NODE_ENV === "production" || req.nextUrl.protocol === "https:";
  const parts = [
    `${cookieName}=${encodeURIComponent(id)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
  ];
  if (isProd) parts.push("Secure");
  const setCookie = parts.join("; ");
  return { id, setCookie };
}

async function trackWithFallback(storyId: string, visitorId: string) {
  // Try to record unique visitor (first time only)
  let isUnique = false;
  const uniqueRes = await supabase
    .from("story_unique_visitors")
    .insert({ story_id: storyId, visitor_id: visitorId });
  if (!uniqueRes.error) {
    isUnique = true;
  }

  // Read current counts (do not overwrite existing totals)
  const { data: existing, error: selErr } = await supabase
    .from("story_views")
    .select("total_views, unique_views")
    .eq("story_id", storyId)
    .maybeSingle();

  if (selErr) {
    // If selection failed for some reason, return safe defaults
    return { total_views: 0, unique_views: isUnique ? 1 : 0, is_unique: isUnique };
  }

  if (!existing) {
    // Insert new row with initial counts
    const { data: inserted } = await supabase
      .from("story_views")
      .insert({
        story_id: storyId,
        total_views: 1,
        unique_views: isUnique ? 1 : 0,
        last_viewed_at: new Date().toISOString(),
      })
      .select("total_views, unique_views")
      .maybeSingle();

    return {
      total_views: inserted?.total_views ?? 1,
      unique_views: inserted?.unique_views ?? (isUnique ? 1 : 0),
      is_unique: isUnique,
    };
  }

  const nextTotal = (existing.total_views ?? 0) + 1;
  const nextUnique = (existing.unique_views ?? 0) + (isUnique ? 1 : 0);

  await supabase
    .from("story_views")
    .update({ total_views: nextTotal, unique_views: nextUnique, last_viewed_at: new Date().toISOString() })
    .eq("story_id", storyId);

  return { total_views: nextTotal, unique_views: nextUnique, is_unique: isUnique };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const storyId = slug?.trim();
  if (!storyId) return NextResponse.json({ error: "Missing story id" }, { status: 400 });

  const { data, error } = await supabase
    .from("story_views")
    .select("total_views, unique_views")
    .eq("story_id", storyId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Failed to load views" }, { status: 500 });
  }

  const resp = NextResponse.json({
    story_id: storyId,
    totalViews: data?.total_views ?? 0,
    uniqueViews: data?.unique_views ?? 0,
  });
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const storyId = slug?.trim();
  if (!storyId) return NextResponse.json({ error: "Missing story id" }, { status: 400 });

  const { id, setCookie } = getVisitorId(req);

  // Cooldown to avoid counting every reload (in seconds)
  const cooldownSec = Math.max(parseInt(process.env.STORY_VIEW_COOLDOWN_SECONDS || "60", 10) || 60, 1);

  // Check recent view window for this visitor
  let withinCooldown = false;
  try {
    const { data: recent } = await supabase
      .from("story_recent_views")
      .select("last_viewed_at")
      .eq("story_id", storyId)
      .eq("visitor_id", id)
      .maybeSingle();

    if (recent?.last_viewed_at) {
      const last = new Date(recent.last_viewed_at);
      const diffSec = (Date.now() - last.getTime()) / 1000;
      withinCooldown = diffSec < cooldownSec;
    }
  } catch {
    // ignore
  }

  if (withinCooldown) {
    // Return current counts without incrementing
    const { data } = await supabase
      .from("story_views")
      .select("total_views, unique_views")
      .eq("story_id", storyId)
      .maybeSingle();

    const respEarly = NextResponse.json({
      story_id: storyId,
      totalViews: data?.total_views ?? 0,
      uniqueViews: data?.unique_views ?? 0,
      isUnique: false,
      throttled: true,
    });
    if (setCookie) respEarly.headers.set("Set-Cookie", setCookie);
    respEarly.headers.set("Cache-Control", "no-store");
    return respEarly;
  }

  // Call RPC to atomically increment counts and return current totals
  let payload: { total_views: number | null; unique_views: number | null; is_unique: boolean } | null = null;
  try {
    const { data, error } = await supabase.rpc("track_story_view", { p_story_id: storyId, p_visitor_id: id });
    if (error) throw error;
    const row = Array.isArray(data) && data[0] ? data[0] : null;
    payload = row ?? { total_views: 0, unique_views: 0, is_unique: false };
  } catch (e: any) {
    // Log and fall back to non-atomic updates if RPC is unavailable (e.g., migration not applied)
    console.error("[track-view] RPC failed:", e?.message || e);
    try {
      const fb = await trackWithFallback(storyId, id);
      payload = fb;
    } catch (fallbackErr) {
      console.error("[track-view] Fallback failed:", (fallbackErr as any)?.message || fallbackErr);
      return NextResponse.json({ error: "Failed to track view" }, { status: 500 });
    }
  }

  // Update recent view window timestamp
  try {
    await supabase
      .from("story_recent_views")
      .upsert({ story_id: storyId, visitor_id: id, last_viewed_at: new Date().toISOString() }, { onConflict: "story_id,visitor_id" });
  } catch {
    // ignore
  }

  const resp = NextResponse.json({
    story_id: storyId,
    totalViews: payload?.total_views ?? 0,
    uniqueViews: payload?.unique_views ?? 0,
    isUnique: !!payload?.is_unique,
    throttled: false,
  });
  if (setCookie) resp.headers.set("Set-Cookie", setCookie);
  resp.headers.set("Cache-Control", "no-store");
  return resp;
}
