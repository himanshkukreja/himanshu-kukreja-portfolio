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
          // Decode the JWT to get user info
          const payloadBase64 = accessToken.split('.')[1];
          const decodedPayload = JSON.parse(atob(payloadBase64));

          console.log("[AuthHashHandler] Decoded user from token:", {
            userId: decodedPayload.sub,
            email: decodedPayload.email,
          });

          // Calculate expiry timestamp
          const expiryTimestamp = expiresAt
            ? parseInt(expiresAt)
            : Math.floor(Date.now() / 1000) + (expiresIn ? parseInt(expiresIn) : 3600);

          // Create complete session object in the format Supabase v2 expects
          const sessionData = {
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_in: expiresIn ? parseInt(expiresIn) : 3600,
            expires_at: expiryTimestamp,
            token_type: "bearer",
            user: {
              id: decodedPayload.sub,
              email: decodedPayload.email,
              aud: decodedPayload.aud,
              role: decodedPayload.role,
              created_at: decodedPayload.created_at,
              updated_at: decodedPayload.updated_at,
              app_metadata: decodedPayload.app_metadata || {},
              user_metadata: decodedPayload.user_metadata || {},
            },
          };

          // Supabase v2 uses this key format: sb-{project-ref}-auth-token
          const storageKey = "sb-jnvxizdhpecnydnvhell-auth-token";

          console.log("[AuthHashHandler] Storing session with key:", storageKey);
          localStorage.setItem(storageKey, JSON.stringify(sessionData));

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
