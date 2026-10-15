import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/user-analytics?userId=xxx
 * Fetch detailed analytics for a specific user
 * Admin only (Bearer session verified by requireAdmin).
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (admin instanceof NextResponse) return admin;

  try {
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json({ error: "userId parameter required" }, { status: 400 });
    }

    // Fetch detailed analytics for specific user
    const [pageViews, sessions, deviceStats, pageStats] = await Promise.all([
      // Recent page views with timeline
      supabase
        .from("analytics_events")
        .select("page_path, page_title, created_at, duration, device_type, browser, city, country")
        .eq("user_id", targetUserId)
        .eq("event_type", "page_view")
        .order("created_at", { ascending: false })
        .limit(100),

      // Sessions
      supabase
        .from("user_sessions")
        .select("*")
        .eq("user_id", targetUserId)
        .order("started_at", { ascending: false })
        .limit(50),

      // Device breakdown
      supabase
        .from("analytics_events")
        .select("device_type, browser, os")
        .eq("user_id", targetUserId)
        .eq("event_type", "page_view"),

      // Page visit frequency
      supabase
        .from("analytics_events")
        .select("page_path, page_title")
        .eq("user_id", targetUserId)
        .eq("event_type", "page_view"),
    ]);

    // Process device stats
    const devices = deviceStats.data || [];
    const deviceBreakdown = devices.reduce((acc: Record<string, number>, event: { device_type: string | null; browser: string | null }) => {
      const key = event.device_type || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const browserBreakdown = devices.reduce((acc: Record<string, number>, event: { device_type: string | null; browser: string | null }) => {
      const key = event.browser || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    // Process most visited pages
    const pages = pageStats.data || [];
    const pageFrequency: { [key: string]: { count: number; title: string } } = {};
    pages.forEach((event: { page_path: string; page_title: string | null }) => {
      const path = event.page_path;
      if (!pageFrequency[path]) {
        pageFrequency[path] = { count: 0, title: event.page_title || path };
      }
      pageFrequency[path].count++;
    });

    const topPages = Object.entries(pageFrequency)
      .map(([path, data]) => ({ path, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({
      pageViews: pageViews.data || [],
      sessions: sessions.data || [],
      deviceBreakdown,
      browserBreakdown,
      topPages,
      totalPageViews: pages.length,
    });
  } catch (error) {
    console.error("[Admin User Analytics] Unexpected error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
