import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("[Test] Testing Supabase connection...");
    console.log("[Test] Supabase URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log("[Test] Service Role Key exists:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

    // First, test with a table we know exists (newsletter_subscribers)
    console.log("[Test] Testing known working table (newsletter_subscribers)...");

    let newsletterData, newsletterError;
    try {
      const result = await supabase
        .from("newsletter_subscribers")
        .select("*", { count: "exact", head: true });
      newsletterData = result.data;
      newsletterError = result.error;
    } catch (e: any) {
      console.error("[Test] Caught exception during newsletter query:", e);
      return NextResponse.json({
        success: false,
        step: "newsletter_test_exception",
        error: e.message,
        stack: e.stack,
        type: e.constructor.name,
      });
    }

    console.log("[Test] Newsletter query completed. Error?", !!newsletterError, "Data?", !!newsletterData);

    if (newsletterError) {
      console.error("[Test] Newsletter table error:", JSON.stringify(newsletterError, null, 2));
      console.log("[Test] Skipping newsletter errors, proceeding to analytics_events test...");
    } else {
      console.log("[Test] Newsletter table works!");
    }

    console.log("[Test] Now testing analytics_events table...");

    // Now try to query the analytics_events table
    let analyticsData, analyticsError, analyticsCount;
    try {
      const result = await supabase
        .from("analytics_events")
        .select("*", { count: "exact", head: false })
        .limit(1);
      analyticsData = result.data;
      analyticsError = result.error;
      analyticsCount = result.count;
    } catch (e: any) {
      console.error("[Test] Caught exception during analytics query:", e);
      return NextResponse.json({
        success: false,
        step: "analytics_test_exception",
        error: e.message,
        stack: e.stack,
        type: e.constructor.name,
      });
    }

    console.log("[Test] Analytics query completed. Error?", !!analyticsError, "Data?", !!analyticsData, "Count:", analyticsCount);

    if (analyticsError) {
      console.error("[Test] Analytics table error:", JSON.stringify(analyticsError, null, 2));
      return NextResponse.json({
        success: false,
        step: "analytics_test",
        error: analyticsError.message || "Unknown error",
        code: analyticsError.code,
        details: analyticsError.details,
        hint: analyticsError.hint,
        fullError: analyticsError,
      });
    }

    console.log("[Test] ✅ Analytics table works! Count:", analyticsCount);

    return NextResponse.json({
      success: true,
      message: "Analytics table is working!",
      analyticsCount: analyticsCount,
      sampleData: analyticsData,
    });
  } catch (error: any) {
    console.error("[Test] Unexpected error:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
