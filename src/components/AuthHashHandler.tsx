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
          // Calculate expiry timestamp
          const expiryTimestamp = expiresAt
            ? parseInt(expiresAt)
            : Math.floor(Date.now() / 1000) + (expiresIn ? parseInt(expiresIn) : 3600);

          // Create session object that Supabase expects
          const session = {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: expiresIn ? parseInt(expiresIn) : 3600,
            expires_at: expiryTimestamp,
            token_type: "bearer",
            user: null, // Will be populated by Supabase
          };

          // Store in localStorage with Supabase's expected key format
          const supabaseKey = `sb-jnvxizdhpecnydnvhell-auth-token`;
          localStorage.setItem(supabaseKey, JSON.stringify(session));

          console.log("[AuthHashHandler] ✅ Session stored in localStorage");
          console.log("[AuthHashHandler] Cleaning URL and reloading...");

          // Clean the URL
          const cleanUrl = window.location.pathname + window.location.search;
          window.history.replaceState({}, document.title, cleanUrl);

          // Reload the page to let Supabase pick up the session from localStorage
          window.location.reload();
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
