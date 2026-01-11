"use client";

import { useEffect, useRef } from "react";
import { supabaseClient } from "@/lib/supabase-client";

/**
 * Component to handle OAuth callback with hash fragment tokens
 * This handles the case when Supabase redirects with #access_token= in the URL
 */
export default function AuthHashHandler() {
  const processedRef = useRef(false);

  useEffect(() => {
    // Only run on client side and only once
    if (typeof window === "undefined" || processedRef.current) return;

    const handleHashFragment = async () => {
      const hash = window.location.hash;
      console.log("[AuthHashHandler] Current URL:", window.location.href);
      console.log("[AuthHashHandler] Hash:", hash);

      // Check if we have auth tokens in the hash
      if (hash && hash.includes("access_token=")) {
        console.log("[AuthHashHandler] ✅ Detected auth tokens in hash fragment");
        processedRef.current = true;

        try {
          // Parse the hash fragment
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");
          const expiresIn = hashParams.get("expires_in");

          console.log("[AuthHashHandler] Tokens extracted:", {
            hasAccessToken: !!accessToken,
            hasRefreshToken: !!refreshToken,
            expiresIn: expiresIn,
          });

          if (accessToken && refreshToken) {
            console.log("[AuthHashHandler] Setting session with tokens...");

            // Set the session using the tokens from the hash
            const { data, error } = await supabaseClient.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error("[AuthHashHandler] ❌ Error setting session:", error);
            } else if (data.session) {
              console.log("[AuthHashHandler] ✅ Session created successfully!");
              console.log("[AuthHashHandler] User ID:", data.session.user.id);
              console.log("[AuthHashHandler] User Email:", data.session.user.email);

              // Clean up the URL by removing the hash fragment
              const cleanUrl = window.location.pathname + window.location.search;
              console.log("[AuthHashHandler] Cleaning URL to:", cleanUrl);
              window.history.replaceState({}, document.title, cleanUrl);

              // Force a re-render of auth state by manually triggering a storage event
              window.dispatchEvent(new Event("storage"));
            } else {
              console.error("[AuthHashHandler] ❌ Session data is null");
            }
          } else {
            console.error("[AuthHashHandler] ❌ Missing access_token or refresh_token");
          }
        } catch (error) {
          console.error("[AuthHashHandler] ❌ Error processing hash fragment:", error);
        }
      } else {
        console.log("[AuthHashHandler] No auth tokens in hash, skipping");
      }
    };

    // Run immediately and also after a small delay as a backup
    handleHashFragment();
    const timer = setTimeout(handleHashFragment, 500);

    return () => clearTimeout(timer);
  }, []);

  return null; // This component doesn't render anything
}
