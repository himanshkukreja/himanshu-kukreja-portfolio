import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-side Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * GET /api/profile?userId=xxx
 * Fetch user profile server-side to bypass client-side Supabase issues
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    console.log('[API Profile] Fetching profile for user:', userId);

    // Get the authorization header from the client
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ error: 'No authorization header' }, { status: 401 });
    }

    // Create a client with the user's access token
    const token = authHeader.replace('Bearer ', '');
    const supabaseWithAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const { data, error } = await supabaseWithAuth
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('[API Profile] Error:', error);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 500 });
    }

    console.log('[API Profile] Success:', !!data);
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error('[API Profile] Exception:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
