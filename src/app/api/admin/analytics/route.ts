import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TimeRange = "7d" | "30d" | "90d" | "all";

/**
 * GET /api/admin/analytics
 * Fetch analytics data for the admin dashboard
 * Requires: Authorization header with ANALYTICS_ADMIN_TOKEN
 */
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.ANALYTICS_ADMIN_TOKEN;

    if (!authHeader || !expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized - Missing authentication" },
        { status: 401 }
      );
    }

    // Support both "Bearer <token>" and just "<token>" formats
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.substring(7)
      : authHeader;

    if (token !== expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized - Invalid token" },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const timeRange = (searchParams.get("range") as TimeRange) || "30d";

    // Calculate date range
    const now = new Date();
    let startDate: Date;

    switch (timeRange) {
      case "7d":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "all":
      default:
        startDate = new Date(0);
        break;
    }

    // Fetch all analytics data for the time range
    const { data: events, error: eventsError } = await supabase
      .from("analytics_events")
      .select("*")
      .gte("created_at", startDate.toISOString())
      .eq("event_type", "page_view");

    if (eventsError) {
      throw eventsError;
    }

    // Process data for dashboard
    const analytics = processAnalyticsData(events || []);

    return NextResponse.json(analytics);
  } catch (error) {
    console.error("[Analytics API] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch analytics" },
      { status: 500 }
    );
  }
}

/**
 * Process raw analytics events into dashboard metrics
 */
function processAnalyticsData(events: any[]) {
  // Overview metrics
  const totalVisits = events.length;
  const uniqueVisitors = new Set(events.map((e) => e.visitor_id)).size;
  const uniqueSessions = new Set(events.map((e) => e.session_id)).size;

  // Visits over time (daily)
  const visitsByDate: Record<string, { date: string; visits: number; unique_visitors: number }> = {};
  events.forEach((event) => {
    const date = new Date(event.created_at).toISOString().split("T")[0];
    if (!visitsByDate[date]) {
      visitsByDate[date] = {
        date,
        visits: 0,
        unique_visitors: 0,
      };
    }
    visitsByDate[date].visits++;
  });

  // Calculate unique visitors per day
  const visitorsByDate: Record<string, Set<string>> = {};
  events.forEach((event) => {
    const date = new Date(event.created_at).toISOString().split("T")[0];
    if (!visitorsByDate[date]) {
      visitorsByDate[date] = new Set();
    }
    visitorsByDate[date].add(event.visitor_id);
  });

  Object.keys(visitorsByDate).forEach((date) => {
    if (visitsByDate[date]) {
      visitsByDate[date].unique_visitors = visitorsByDate[date].size;
    }
  });

  const visitsTimeline = Object.values(visitsByDate).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Top pages
  const pageStats: Record<
    string,
    { path: string; title: string; visits: number; unique_visitors: Set<string> }
  > = {};
  events.forEach((event) => {
    const path = event.page_path;
    if (!pageStats[path]) {
      pageStats[path] = {
        path,
        title: event.page_title || path,
        visits: 0,
        unique_visitors: new Set(),
      };
    }
    pageStats[path].visits++;
    pageStats[path].unique_visitors.add(event.visitor_id);
  });

  const topPages = Object.values(pageStats)
    .map((page) => ({
      path: page.path,
      title: page.title,
      visits: page.visits,
      unique_visitors: page.unique_visitors.size,
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);

  // Referrer sources
  const referrerStats: Record<string, { source: string; visits: number; unique_visitors: Set<string> }> = {};
  events.forEach((event) => {
    const source = event.referrer_domain || "Direct";
    if (!referrerStats[source]) {
      referrerStats[source] = {
        source,
        visits: 0,
        unique_visitors: new Set(),
      };
    }
    referrerStats[source].visits++;
    referrerStats[source].unique_visitors.add(event.visitor_id);
  });

  const topReferrers = Object.values(referrerStats)
    .map((ref) => ({
      source: ref.source,
      visits: ref.visits,
      unique_visitors: ref.unique_visitors.size,
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);

  // Device breakdown
  const deviceStats: Record<string, number> = {};
  events.forEach((event) => {
    const device = event.device_type || "Unknown";
    deviceStats[device] = (deviceStats[device] || 0) + 1;
  });

  const deviceBreakdown = Object.entries(deviceStats).map(([device, count]) => ({
    device,
    count,
    percentage: Math.round((count / totalVisits) * 100),
  }));

  // Browser breakdown
  const browserStats: Record<string, number> = {};
  events.forEach((event) => {
    const browser = event.browser || "Unknown";
    browserStats[browser] = (browserStats[browser] || 0) + 1;
  });

  const browserBreakdown = Object.entries(browserStats)
    .map(([browser, count]) => ({
      browser,
      count,
      percentage: Math.round((count / totalVisits) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // OS breakdown
  const osStats: Record<string, number> = {};
  events.forEach((event) => {
    const os = event.os || "Unknown";
    osStats[os] = (osStats[os] || 0) + 1;
  });

  const osBreakdown = Object.entries(osStats)
    .map(([os, count]) => ({
      os,
      count,
      percentage: Math.round((count / totalVisits) * 100),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Geographic breakdown
  const countryStats: Record<string, { count: number; cities: Set<string> }> = {};
  events.forEach((event) => {
    const country = event.country || "Unknown";
    const city = event.city || "Unknown";

    if (!countryStats[country]) {
      countryStats[country] = { count: 0, cities: new Set() };
    }
    countryStats[country].count++;
    if (city !== "Unknown") {
      countryStats[country].cities.add(city);
    }
  });

  const geoBreakdown = Object.entries(countryStats)
    .map(([country, data]) => ({
      country,
      visits: data.count,
      percentage: Math.round((data.count / totalVisits) * 100),
      cities: Array.from(data.cities),
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);

  // City breakdown (top cities across all countries)
  const cityStats: Record<string, { count: number; country: string }> = {};
  events.forEach((event) => {
    if (!event.city || !event.country) return;
    const cityKey = `${event.city}, ${event.country}`;
    if (!cityStats[cityKey]) {
      cityStats[cityKey] = { count: 0, country: event.country };
    }
    cityStats[cityKey].count++;
  });

  const topCities = Object.entries(cityStats)
    .map(([city, data]) => ({
      city,
      visits: data.count,
      percentage: Math.round((data.count / totalVisits) * 100),
    }))
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 10);

  return {
    overview: {
      totalVisits,
      uniqueVisitors,
      uniqueSessions,
      avgSessionDuration: Math.round(
        events.reduce((sum, e) => sum + (e.duration || 0), 0) / events.length
      ),
    },
    visitsTimeline,
    topPages,
    topReferrers,
    deviceBreakdown,
    browserBreakdown,
    osBreakdown,
    geoBreakdown,
    topCities,
  };
}
