import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/user-analytics?userId=xxx
 * Fetch detailed analytics for a specific user
 * Admin only endpoint - requires x-admin-email header
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (!targetUserId) {
      return NextResponse.json({ error: "userId parameter required" }, { status: 400 });
    }

    // Check admin authentication via header
    const adminEmail = request.headers.get("x-admin-email");
    const adminEmails = [
      "himanshuk9303@gmail.com",
      process.env.ADMIN_EMAIL,
    ].filter(Boolean);

    if (!adminEmail || !adminEmails.includes(adminEmail)) {
      return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 401 });
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
    const deviceBreakdown = devices.reduce((acc: any, event: any) => {
      const key = event.device_type || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    const browserBreakdown = devices.reduce((acc: any, event: any) => {
      const key = event.browser || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    // Process most visited pages
    const pages = pageStats.data || [];
    const pageFrequency: { [key: string]: { count: number; title: string } } = {};
    pages.forEach((event: any) => {
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
  } catch (error: any) {
    console.error("[Admin User Analytics] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
