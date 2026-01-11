import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side OAuth callback route
 * This simply passes through to the client-side page which handles session creation
 * We need the client to handle it so the session is saved to localStorage
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  console.log("[Auth Callback API] Received OAuth callback, delegating to client page");
  console.log("[Auth Callback API] Params:", Object.fromEntries(requestUrl.searchParams));

  // Let the client-side page.tsx handle the actual OAuth flow
  // This ensures the session is properly saved to localStorage
  // The route.ts runs first in Next.js, so we just pass through
  return NextResponse.next();
}
