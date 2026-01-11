import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Create Supabase client for API routes (lazy initialization)
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
    },
  });
}

// GET /api/progress - Get learning progress for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters for filtering
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("course_id");
    const week = searchParams.get("week");
    const lessonSlug = searchParams.get("lesson_slug");

    let query = supabase
      .from("learning_progress")
      .select("*")
      .eq("user_id", user.id);

    if (courseId) {
      query = query.eq("course_id", courseId);
    }
    if (week) {
      query = query.eq("week", week);
    }
    if (lessonSlug) {
      query = query.eq("lesson_slug", lessonSlug);
    }

    const { data, error } = await query.order("last_accessed_at", {
      ascending: false,
    });

    if (error) {
      console.error("[Progress API] Error fetching progress:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If specific lesson was requested, return single object
    if (lessonSlug && data && data.length > 0) {
      return NextResponse.json({ progress: data[0] });
    }

    return NextResponse.json({ progress: data });
  } catch (error: any) {
    console.error("[Progress API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/progress - Update or create learning progress
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      course_id,
      week,
      lesson_slug,
      status,
      progress_percentage,
      time_spent,
    } = body;

    // Validate required fields
    if (!course_id || !week || !lesson_slug) {
      return NextResponse.json(
        { error: "Missing required fields: course_id, week, lesson_slug" },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {
      user_id: user.id,
      course_id,
      week,
      lesson_slug,
      last_accessed_at: new Date().toISOString(),
    };

    if (status !== undefined) {
      updateData.status = status;

      // Set timestamps based on status
      if (status === "in_progress" && !updateData.started_at) {
        updateData.started_at = new Date().toISOString();
      }
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
        updateData.progress_percentage = 100;
      }
    }

    if (progress_percentage !== undefined) {
      updateData.progress_percentage = Math.min(100, Math.max(0, progress_percentage));
    }

    if (time_spent !== undefined) {
      updateData.time_spent = time_spent;
    }

    // Upsert (insert or update) the progress record
    const { data, error } = await supabase
      .from("learning_progress")
      .upsert(updateData, {
        onConflict: "user_id,course_id,week,lesson_slug",
      })
      .select()
      .single();

    if (error) {
      console.error("[Progress API] Error updating progress:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ progress: data });
  } catch (error: any) {
    console.error("[Progress API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/progress - Increment time spent on a lesson
export async function PATCH(request: NextRequest) {
  const supabase = getSupabaseClient();
  try {
    // Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { course_id, week, lesson_slug, time_increment } = body;

    // Validate required fields
    if (!course_id || !week || !lesson_slug || !time_increment) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: course_id, week, lesson_slug, time_increment",
        },
        { status: 400 }
      );
    }

    // First, get the current progress
    const { data: currentProgress, error: fetchError } = await supabase
      .from("learning_progress")
      .select("time_spent")
      .eq("user_id", user.id)
      .eq("course_id", course_id)
      .eq("week", week)
      .eq("lesson_slug", lesson_slug)
      .single();

    const currentTimeSpent = currentProgress?.time_spent || 0;

    // Update with incremented time
    const { data, error } = await supabase
      .from("learning_progress")
      .upsert(
        {
          user_id: user.id,
          course_id,
          week,
          lesson_slug,
          time_spent: currentTimeSpent + time_increment,
          last_accessed_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,course_id,week,lesson_slug",
        }
      )
      .select()
      .single();

    if (error) {
      console.error("[Progress API] Error incrementing time:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ progress: data });
  } catch (error: any) {
    console.error("[Progress API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
