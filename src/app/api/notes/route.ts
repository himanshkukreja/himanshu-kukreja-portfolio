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

// GET /api/notes - Get notes for the current user
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
    const noteType = searchParams.get("note_type");

    let query = supabase
      .from("content_notes")
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
    if (noteType) {
      query = query.eq("note_type", noteType);
    }

    const { data, error } = await query.order("created_at", {
      ascending: false,
    });

    if (error) {
      console.error("[Notes API] Error fetching notes:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ notes: data });
  } catch (error: any) {
    console.error("[Notes API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/notes - Create a new note
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
      note_text,
      note_type,
      highlight_text,
      highlight_offset,
      color,
      is_private,
    } = body;

    // Validate required fields
    if (!course_id || !week || !lesson_slug || !note_text) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: course_id, week, lesson_slug, note_text",
        },
        { status: 400 }
      );
    }

    // Insert note
    const { data, error } = await supabase
      .from("content_notes")
      .insert({
        user_id: user.id,
        course_id,
        week,
        lesson_slug,
        note_text,
        note_type: note_type || "general",
        highlight_text: highlight_text || null,
        highlight_offset: highlight_offset || null,
        color: color || "yellow",
        is_private: is_private !== undefined ? is_private : true,
      })
      .select()
      .single();

    if (error) {
      console.error("[Notes API] Error creating note:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ note: data }, { status: 201 });
  } catch (error: any) {
    console.error("[Notes API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/notes - Update an existing note
export async function PATCH(request: NextRequest) {
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
    const { id, note_text, note_type, color, is_private } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 }
      );
    }

    // Prepare update data
    const updateData: any = {};
    if (note_text !== undefined) updateData.note_text = note_text;
    if (note_type !== undefined) updateData.note_type = note_type;
    if (color !== undefined) updateData.color = color;
    if (is_private !== undefined) updateData.is_private = is_private;

    // Update note (RLS ensures user can only update their own notes)
    const { data, error } = await supabase
      .from("content_notes")
      .update(updateData)
      .eq("id", id)
      .eq("user_id", user.id)
      .select()
      .single();

    if (error) {
      console.error("[Notes API] Error updating note:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    return NextResponse.json({ note: data });
  } catch (error: any) {
    console.error("[Notes API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/notes - Delete a note
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
    const noteId = searchParams.get("id");

    if (!noteId) {
      return NextResponse.json(
        { error: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    // Delete note (RLS ensures user can only delete their own notes)
    const { error } = await supabase
      .from("content_notes")
      .delete()
      .eq("id", noteId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[Notes API] Error deleting note:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Note deleted successfully" });
  } catch (error: any) {
    console.error("[Notes API] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
