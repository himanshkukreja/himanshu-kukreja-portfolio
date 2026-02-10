import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/users
 * Fetch all users with their activity stats
 * Admin only endpoint - requires x-admin-email header
 */
export async function GET(request: NextRequest) {
  try {
    // Check admin authentication via header
    const adminEmail = request.headers.get("x-admin-email");
    const adminEmails = [
      "kukreja.him@gmail.com",
      process.env.ADMIN_EMAIL,
    ].filter(Boolean);

    if (!adminEmail || !adminEmails.includes(adminEmail)) {
      return NextResponse.json({ error: "Unauthorized - Admin only" }, { status: 401 });
    }

    // Fetch user activity data from the view
    const { data: users, error } = await supabase
      .from("admin_user_activity")
      .select("*")
      .order("signed_up_at", { ascending: false });

    if (error) {
      console.error("[Admin Users] Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch users", details: error.message },
        { status: 500 }
      );
    }

    // Get auth users to include email
    const { data: authUsers } = await supabase.auth.admin.listUsers();

    // Merge auth data with profile data
    const enrichedUsers = users?.map((user) => {
      const authUser = authUsers?.users.find((au) => au.id === user.user_id);
      return {
        ...user,
        email: authUser?.email,
        email_confirmed_at: authUser?.email_confirmed_at,
        last_sign_in_at: authUser?.last_sign_in_at,
      };
    });

    return NextResponse.json({
      users: enrichedUsers || [],
      total: enrichedUsers?.length || 0,
    });
  } catch (error: any) {
    console.error("[Admin Users] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
