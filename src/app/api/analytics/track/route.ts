import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/analytics/track
 * Track analytics event with automatic geolocation from Vercel Edge
*/
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Get geolocation data from Vercel Edge (automatically provided in production)
    // @ts-ignore - geo is a Vercel-specific property
    const geo = request.geo;
    const country = geo?.country || undefined;
    const city = geo?.city || undefined;
    const latitude = geo?.latitude || undefined;
    const longitude = geo?.longitude || undefined;
    const region = geo?.region || undefined;

    // Get IP address
    const ip = request.headers.get("x-forwarded-for") ||
                request.headers.get("x-real-ip") ||
                undefined;

    // Insert event with geo data (using shared supabase client)
    // Note: 'region' field removed to match actual table schema
    const { error } = await supabase.from("analytics_events").insert([
      {
        ...body,
        country,
        city,
        ip_address: ip,
        metadata: {
          ...body.metadata,
          latitude,
          longitude,
          region, // Store region in metadata instead
        },
      },
    ]);

    if (error) {
      console.error("[Analytics Track] Error:", error);
      return NextResponse.json({ error: "Failed to track event" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[Analytics Track] Error:", error);
    return NextResponse.json({ error: "Failed to track event" }, { status: 500 });
  }
}
