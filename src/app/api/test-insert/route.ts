import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    console.log("[Test Insert] Attempting to insert a test event...");

    // Try to insert a minimal test event (without region field)
    const { data, error } = await supabase
      .from("analytics_events")
      .insert([
        {
          event_type: "page_view",
          page_path: "/test",
          page_title: "Test Page",
          visitor_id: "test-visitor",
          session_id: "test-session",
          referrer: "http://localhost:3000",
          referrer_domain: "localhost",
        },
      ])
      .select();

    if (error) {
      console.error("[Test Insert] Error:", JSON.stringify(error, null, 2));
      return NextResponse.json({
        success: false,
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
    }

    console.log("[Test Insert] ✅ Successfully inserted test event!");
    console.log("[Test Insert] Inserted data:", data);

    // Now verify we can read it back
    const { data: readData, error: readError } = await supabase
      .from("analytics_events")
      .select("*")
      .limit(5);

    if (readError) {
      return NextResponse.json({
        success: true,
        inserted: true,
        readError: readError.message,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Test event inserted and verified!",
      insertedData: data,
      allEvents: readData,
      totalEvents: readData?.length || 0,
    });
  } catch (error: any) {
    console.error("[Test Insert] Unexpected error:", error);
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: error.stack,
    }, { status: 500 });
  }
}
