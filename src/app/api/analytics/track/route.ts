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

    // Fallback to ipapi.co for more accurate geo data (especially region)
    // Only call if we have an IP and missing critical data
    // Note: ipapi.co has a free tier of 30,000 requests/month
    if (ip && (!region || !city)) {
      try {
        const geoResponse = await fetch(
          `https://ipapi.co/${ip}/json/`,
          {
            headers: { 'User-Agent': 'Analytics-Tracker' },
            signal: AbortSignal.timeout(3000) // 3 second timeout
          }
        );

        if (geoResponse.ok) {
          const geoData = await geoResponse.json();
          // Use fallback data only if Vercel didn't provide it
          // IMPORTANT: Use country_code (2-letter) not country_name
          const countryCode = geoData.country_code || geoData.country;
          country = country || (countryCode ? countryCode.substring(0, 2).toUpperCase() : undefined);
          city = city || geoData.city;
          region = region || geoData.region;
          latitude = latitude || geoData.latitude;
          longitude = longitude || geoData.longitude;
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
      console.error("[Analytics Track] Supabase Error:", error);
      return NextResponse.json({
        error: "Failed to track event",
        details: error.message,
        code: error.code
      }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[Analytics Track] Unexpected Error:", error);
    return NextResponse.json({
      error: "Failed to track event",
      details: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
