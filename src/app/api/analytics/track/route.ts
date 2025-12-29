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

    // Get IP address
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
                request.headers.get("x-real-ip") ||
                undefined;

    // Get geolocation data from Vercel Edge first
    // @ts-ignore - geo is a Vercel-specific property
    const vercelGeo = request.geo;
    let country = vercelGeo?.country || undefined;
    let city = vercelGeo?.city || undefined;
    let region = vercelGeo?.region || undefined;
    let latitude = vercelGeo?.latitude || undefined;
    let longitude = vercelGeo?.longitude || undefined;

    // Fallback to ip-api.com for more accurate geo data (especially region)
    // Only call if we have an IP and missing critical data
    if (ip && (!region || !city)) {
      try {
        const geoResponse = await fetch(
          `http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon,timezone`
        );

        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          if (geoData.status === "success") {
            // Use fallback data only if Vercel didn't provide it
            country = country || geoData.country;
            city = city || geoData.city;
            region = region || geoData.regionName;
            latitude = latitude || geoData.lat;
            longitude = longitude || geoData.lon;
          }
        }
      } catch (geoError) {
        // Silently fail - we'll just use Vercel's data
        console.warn("[Analytics] IP geolocation fallback failed:", geoError);
      }
    }

    // Insert event with geo data
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
          region, // Store region in metadata
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
