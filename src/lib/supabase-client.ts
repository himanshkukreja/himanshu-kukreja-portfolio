/**
 * Client-side Supabase client for authentication and user operations
 * This is separate from the server-side client (supabase.ts) which uses service role
 */

import { createClient } from "@supabase/supabase-js";

// Create a singleton instance for client-side operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables");
}

export const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  },
});

// =====================================================
// Type Definitions
// =====================================================

export type UserProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  learning_goal: string | null;
  experience_level: "beginner" | "intermediate" | "advanced";
  created_at: string;
  updated_at: string;
  last_seen_at: string;
  profile_visibility: "private" | "public";
  total_lessons_completed: number;
  total_time_spent: number;
  current_streak: number;
  longest_streak: number;
};

export type LearningProgress = {
  id: string;
  user_id: string;
  course_id: string;
  week: string;
  lesson_slug: string;
  status: "not_started" | "in_progress" | "completed";
  progress_percentage: number;
  time_spent: number;
  started_at: string | null;
  completed_at: string | null;
  last_accessed_at: string;
  created_at: string;
  updated_at: string;
};

export type Bookmark = {
  id: string;
  user_id: string;
  course_id: string;
  week: string;
  lesson_slug: string;
  custom_title: string | null;
  note: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
};

export type ContentNote = {
  id: string;
  user_id: string;
  course_id: string;
  week: string;
  lesson_slug: string;
  note_text: string;
  note_type: "general" | "question" | "important" | "todo";
  highlight_text: string | null;
  highlight_offset: number | null;
  color: "yellow" | "green" | "blue" | "red" | "purple";
  is_private: boolean;
  created_at: string;
  updated_at: string;
};

// =====================================================
// Authentication Functions
// =====================================================

/**
 * Sign in with email (will send OTP and auto-create user if needed)
 * No separate signup needed - Supabase handles both signin and signup
 */
export async function signInWithEmail(email: string) {
  // Store the current path in localStorage so we can redirect back after authentication
  const currentPath = window.location.pathname + window.location.search;
  localStorage.setItem('auth_redirect_path', currentPath);

  console.log('[signInWithEmail] Storing redirect path:', currentPath);

  const { data, error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true, // Auto-create user if doesn't exist
      emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(currentPath)}`,
    },
  });

  return { data, error };
}

/**
 * @deprecated Use signInWithEmail instead - no separate signup needed
 */
export async function signUpWithEmail(email: string) {
  return signInWithEmail(email);
}

/**
 * Verify OTP code
 */
export async function verifyOtp(email: string, token: string) {
  const { data, error } = await supabaseClient.auth.verifyOtp({
    email,
    token,
    type: "email",
  });

  return { data, error };
}

/**
 * Sign in with Google OAuth
 */
export async function signInWithGoogle() {
  // Store the current path in localStorage so we can redirect back after OAuth
  // This is necessary because OAuth hash fragment redirects lose query parameters
  const currentPath = window.location.pathname + window.location.search;
  localStorage.setItem('auth_redirect_path', currentPath);

  console.log('[signInWithGoogle] Storing redirect path:', currentPath);

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(currentPath)}`,
      skipBrowserRedirect: false,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  return { data, error };
}

/**
 * Sign out
 */
export async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  return { error };
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabaseClient.auth.getUser();
  return { user, error };
}

/**
 * Get current session
 */
export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabaseClient.auth.getSession();
  return { session, error };
}

// =====================================================
// User Profile Functions
// =====================================================

/**
 * Get user profile with proper timeout handling
 */
export async function getUserProfile(userId: string): Promise<{ data: UserProfile | null; error: any }> {
  try {
    console.log('[getUserProfile] Fetching profile for user:', userId);

    // Create a timeout promise
    const timeoutPromise = new Promise<{ data: null; error: any }>((_, reject) => {
      setTimeout(() => {
        reject(new Error('Profile fetch timeout after 5s'));
      }, 5000);
    });

    // First, verify the session is valid
    const { data: { session } } = await supabaseClient.auth.getSession();

    if (!session) {
      console.warn('[getUserProfile] No active session found');
      return { data: null, error: { message: 'No active session', code: 'NO_SESSION' } };
    }

    // Create the fetch promise
    const fetchPromise = (async () => {
      const { data, error } = await supabaseClient
        .from("user_profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      console.log('[getUserProfile] Response:', {
        hasData: !!data,
        error: error ? error.message : null,
        errorCode: error?.code,
      });

      return { data, error };
    })();

    // Race between fetch and timeout
    try {
      const result = await Promise.race([fetchPromise, timeoutPromise]);
      return result;
    } catch (timeoutError: any) {
      console.error('[getUserProfile] Request timeout:', timeoutError.message);
      return { data: null, error: { message: timeoutError.message, code: 'TIMEOUT' } };
    }
  } catch (err: any) {
    console.error('[getUserProfile] Exception:', err);
    return { data: null, error: err };
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>
): Promise<{ data: UserProfile | null; error: any }> {
  const { data, error } = await supabaseClient
    .from("user_profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();

  return { data, error };
}

/**
 * Create user profile (called automatically on signup via trigger, but can be called manually)
 */
export async function createUserProfile(
  userId: string,
  profile: Partial<UserProfile>
): Promise<{ data: UserProfile | null; error: any }> {
  const { data, error } = await supabaseClient
    .from("user_profiles")
    .insert({ id: userId, ...profile })
    .select()
    .single();

  return { data, error };
}

// =====================================================
// Learning Progress Functions
// =====================================================

/**
 * Get learning progress for a lesson
 */
export async function getLessonProgress(
  userId: string,
  courseId: string,
  week: string,
  lessonSlug: string
): Promise<{ data: LearningProgress | null; error: any }> {
  const { data, error } = await supabaseClient
    .from("learning_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("week", week)
    .eq("lesson_slug", lessonSlug)
    .single();

  return { data, error };
}

/**
 * Get all progress for a course
 */
export async function getCourseProgress(
  userId: string,
  courseId: string
): Promise<{ data: LearningProgress[]; error: any }> {
  const { data, error } = await supabaseClient
    .from("learning_progress")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("updated_at", { ascending: false });

  return { data: data || [], error };
}

/**
 * Update or create learning progress
 */
export async function upsertLessonProgress(
  progress: Omit<LearningProgress, "id" | "created_at" | "updated_at">
): Promise<{ data: LearningProgress | null; error: any }> {
  const { data, error } = await supabaseClient
    .from("learning_progress")
    .upsert(progress, {
      onConflict: "user_id,course_id,week,lesson_slug",
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Mark lesson as completed
 */
export async function markLessonComplete(
  userId: string,
  courseId: string,
  week: string,
  lessonSlug: string,
  timeSpent: number = 0
): Promise<{ data: LearningProgress | null; error: any }> {
  return upsertLessonProgress({
    user_id: userId,
    course_id: courseId,
    week,
    lesson_slug: lessonSlug,
    status: "completed",
    progress_percentage: 100,
    time_spent: timeSpent,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    last_accessed_at: new Date().toISOString(),
  });
}

// =====================================================
// Bookmark Functions
// =====================================================

/**
 * Get all bookmarks for a user
 */
export async function getUserBookmarks(userId: string): Promise<{ data: Bookmark[]; error: any }> {
  const { data, error } = await supabaseClient
    .from("bookmarks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return { data: data || [], error };
}

/**
 * Check if lesson is bookmarked
 */
export async function isLessonBookmarked(
  userId: string,
  courseId: string,
  week: string,
  lessonSlug: string
): Promise<{ isBookmarked: boolean; bookmark: Bookmark | null; error: any }> {
  const { data, error } = await supabaseClient
    .from("bookmarks")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("week", week)
    .eq("lesson_slug", lessonSlug)
    .single();

  return { isBookmarked: !!data, bookmark: data, error };
}

/**
 * Add bookmark
 */
export async function addBookmark(
  userId: string,
  courseId: string,
  week: string,
  lessonSlug: string,
  options?: {
    customTitle?: string;
    note?: string;
    tags?: string[];
  }
): Promise<{ data: Bookmark | null; error: any }> {
  const { data, error } = await supabaseClient
    .from("bookmarks")
    .insert({
      user_id: userId,
      course_id: courseId,
      week,
      lesson_slug: lessonSlug,
      custom_title: options?.customTitle,
      note: options?.note,
      tags: options?.tags,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Remove bookmark
 */
export async function removeBookmark(bookmarkId: string): Promise<{ error: any }> {
  const { error } = await supabaseClient.from("bookmarks").delete().eq("id", bookmarkId);

  return { error };
}

// =====================================================
// Content Notes Functions
// =====================================================

/**
 * Get notes for a lesson
 */
export async function getLessonNotes(
  userId: string,
  courseId: string,
  week: string,
  lessonSlug: string
): Promise<{ data: ContentNote[]; error: any }> {
  const { data, error } = await supabaseClient
    .from("content_notes")
    .select("*")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("week", week)
    .eq("lesson_slug", lessonSlug)
    .order("created_at", { ascending: true });

  return { data: data || [], error };
}

/**
 * Add a note
 */
export async function addNote(
  userId: string,
  courseId: string,
  week: string,
  lessonSlug: string,
  noteText: string,
  options?: {
    noteType?: ContentNote["note_type"];
    highlightText?: string;
    highlightOffset?: number;
    color?: ContentNote["color"];
    isPrivate?: boolean;
  }
): Promise<{ data: ContentNote | null; error: any }> {
  const { data, error } = await supabaseClient
    .from("content_notes")
    .insert({
      user_id: userId,
      course_id: courseId,
      week,
      lesson_slug: lessonSlug,
      note_text: noteText,
      note_type: options?.noteType || "general",
      highlight_text: options?.highlightText,
      highlight_offset: options?.highlightOffset,
      color: options?.color || "yellow",
      is_private: options?.isPrivate !== undefined ? options.isPrivate : true,
    })
    .select()
    .single();

  return { data, error };
}

/**
 * Update a note
 */
export async function updateNote(
  noteId: string,
  updates: Partial<ContentNote>
): Promise<{ data: ContentNote | null; error: any }> {
  const { data, error } = await supabaseClient
    .from("content_notes")
    .update(updates)
    .eq("id", noteId)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete a note
 */
export async function deleteNote(noteId: string): Promise<{ error: any }> {
  const { error } = await supabaseClient.from("content_notes").delete().eq("id", noteId);

  return { error };
}

// =====================================================
// Utility Functions
// =====================================================

/**
 * Listen to auth state changes
 */
export function onAuthStateChange(callback: (event: string, session: any) => void) {
  return supabaseClient.auth.onAuthStateChange(callback);
}
