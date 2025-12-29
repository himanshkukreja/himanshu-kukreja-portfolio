import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * POST /api/analytics/track
 * Track analytics event with automatic geolocation from Vercel Edge
*/
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Create Supabase client for Edge runtime
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

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

    // Insert event with geo data
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
