import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirect = requestUrl.searchParams.get("redirect");
  const origin = requestUrl.origin;

  console.log("[Auth Callback] Code:", code ? "present" : "missing");
  console.log("[Auth Callback] Redirect param:", redirect);
  console.log("[Auth Callback] Origin:", origin);

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Exchange the code for a session
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Successful authentication
      // Check if this is a new user (account created in last 60 seconds)
      if (data?.user) {
        const userId = data.user.id;

        // Send welcome email for new users
        try {
          await fetch(`${origin}/api/send-welcome-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });
        } catch (emailError) {
          console.error('[Auth Callback] Failed to send welcome email:', emailError);
        }
      }

      // Redirect back to the original page
      const redirectPath = redirect || '/';
      console.log("[Auth Callback] ✅ Success! Redirecting to:", redirectPath);
      console.log("[Auth Callback] Full URL:", `${origin}${redirectPath}`);
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }

    console.error("[Auth Callback] Error exchanging code:", error);
  }

  // If there's an error or no code, redirect back to the original page
  const fallbackPath = redirect || '/';
  console.log("[Auth Callback] ⚠️  No code or error. Redirecting to:", fallbackPath);
  return NextResponse.redirect(`${origin}${fallbackPath}`);
}
