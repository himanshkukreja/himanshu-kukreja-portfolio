import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const accessToken = requestUrl.searchParams.get("access_token");
  const refreshToken = requestUrl.searchParams.get("refresh_token");
  const redirect = requestUrl.searchParams.get("redirect");
  const origin = requestUrl.origin;

  console.log("[Auth Callback] Code:", code ? "present" : "missing");
  console.log("[Auth Callback] Tokens:", accessToken ? "present" : "missing");
  console.log("[Auth Callback] Redirect param:", redirect);
  console.log("[Auth Callback] Origin:", origin);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );

  // Handle direct token exchange (from hash fragment redirect)
  if (accessToken && refreshToken) {
    console.log("[Auth Callback] Using tokens from query params");

    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!error && data?.session) {
        console.log("[Auth Callback] ✅ Session created from tokens!");

        // Send welcome email for new users
        if (data.user) {
          try {
            await fetch(`${origin}/api/send-welcome-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: data.user.id }),
            });
          } catch (emailError) {
            console.error('[Auth Callback] Failed to send welcome email:', emailError);
          }
        }

        // Use the redirect path from query params, defaulting to homepage
        const redirectPath = redirect || '/';
        console.log("[Auth Callback] Redirecting to:", redirectPath);

        // Set cookies to persist session
        const response = NextResponse.redirect(`${origin}${redirectPath}`);

        // Set session cookies
        response.cookies.set('sb-access-token', accessToken, {
          path: '/',
          sameSite: 'lax',
          secure: true,
          maxAge: 60 * 60, // 1 hour
        });
        response.cookies.set('sb-refresh-token', refreshToken, {
          path: '/',
          sameSite: 'lax',
          secure: true,
          maxAge: 60 * 60 * 24 * 30, // 30 days
        });

        return response;
      }

      console.error("[Auth Callback] Error setting session:", error);
    } catch (err) {
      console.error("[Auth Callback] Exception setting session:", err);
    }
  }

  // Handle PKCE code exchange (standard flow)
  if (code) {
    // Exchange the code for a session
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Successful authentication
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
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }

    console.error("[Auth Callback] Error exchanging code:", error);
  }

  // If there's an error or no code, redirect back to the original page
  const fallbackPath = redirect || '/';
  console.log("[Auth Callback] ⚠️  No code or tokens. Redirecting to:", fallbackPath);
  return NextResponse.redirect(`${origin}${fallbackPath}`);
}
