"use client";

import { useEffect, useRef } from "react";

/**
 * Component to handle OAuth callback with hash fragment tokens
 * Manually stores session in localStorage for Supabase to pick up
 */
export default function AuthHashHandler() {
  const processedRef = useRef(false);

  useEffect(() => {
    // Only run on client side and only once
    if (typeof window === "undefined" || processedRef.current) return;

    const hash = window.location.hash;

    // Check if we have auth tokens in the hash
    if (hash && hash.includes("access_token=")) {
      console.log("[AuthHashHandler] ✅ Detected auth tokens in hash");
      processedRef.current = true;

      try {
        // Parse the hash fragment
        const hashParams = new URLSearchParams(hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const expiresIn = hashParams.get("expires_in");
        const expiresAt = hashParams.get("expires_at");

        console.log("[AuthHashHandler] Extracted tokens:", {
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          expiresIn,
        });

        if (accessToken && refreshToken) {
          console.log("[AuthHashHandler] Processing tokens and redirecting to callback...");

          // Instead of manually storing in localStorage, redirect to our callback endpoint
          // This is more reliable and lets the server handle session creation
          const callbackUrl = `/auth/callback?access_token=${encodeURIComponent(accessToken)}&refresh_token=${encodeURIComponent(refreshToken)}&expires_in=${expiresIn || 3600}&token_type=bearer`;

          console.log("[AuthHashHandler] Redirecting to callback handler");
          window.location.href = callbackUrl;
        } else {
          console.error("[AuthHashHandler] ❌ Missing tokens");
        }
      } catch (error) {
        console.error("[AuthHashHandler] ❌ Error processing hash:", error);
      }
    }
  }, []);

  return null;
}
