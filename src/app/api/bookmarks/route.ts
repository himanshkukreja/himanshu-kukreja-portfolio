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

// GET /api/bookmarks - Get all bookmarks for the current user
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();

    // Get authorization token from request headers
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current user using the token
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get bookmarks with optional filtering
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get("course_id");

    let query = supabase
      .from("bookmarks")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (courseId) {
      query = query.eq("course_id", courseId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[Bookmarks API] Error fetching bookmarks:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookmarks: data });
  } catch (error: any) {
    console.error("[Bookmarks API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/bookmarks - Add a new bookmark
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
    const { course_id, week, lesson_slug, note, tags } = body;

    // Validate required fields
    if (!course_id || !week || !lesson_slug) {
      return NextResponse.json(
        { error: "Missing required fields: course_id, week, lesson_slug" },
        { status: 400 }
      );
    }

    // Insert bookmark (will fail if already exists due to UNIQUE constraint)
    const { data, error } = await supabase
      .from("bookmarks")
      .insert({
        user_id: user.id,
        course_id,
        week,
        lesson_slug,
        note: note || null,
        tags: tags || null,
      })
      .select()
      .single();

    if (error) {
      // Check if it's a duplicate constraint error
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "Bookmark already exists" },
          { status: 409 }
        );
      }
      console.error("[Bookmarks API] Error creating bookmark:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ bookmark: data }, { status: 201 });
  } catch (error: any) {
    console.error("[Bookmarks API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/bookmarks - Remove a bookmark
export async function DELETE(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const bookmarkId = searchParams.get("id");
    const courseId = searchParams.get("course_id");
    const week = searchParams.get("week");
    const lessonSlug = searchParams.get("lesson_slug");

    // Allow deletion by ID or by course/week/lesson combination
    let query = supabase.from("bookmarks").delete().eq("user_id", user.id);

    if (bookmarkId) {
      query = query.eq("id", bookmarkId);
    } else if (courseId && week && lessonSlug) {
      query = query
        .eq("course_id", courseId)
        .eq("week", week)
        .eq("lesson_slug", lessonSlug);
    } else {
      return NextResponse.json(
        { error: "Must provide either 'id' or 'course_id, week, lesson_slug'" },
        { status: 400 }
      );
    }

    const { error } = await query;

    if (error) {
      console.error("[Bookmarks API] Error deleting bookmark:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Bookmark deleted successfully" });
  } catch (error: any) {
    console.error("[Bookmarks API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
