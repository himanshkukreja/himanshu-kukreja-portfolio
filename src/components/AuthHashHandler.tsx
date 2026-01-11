"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";

/**
 * Component to handle OAuth callback with hash fragment tokens
 * This handles the case when Supabase redirects with #access_token= in the URL
 */
export default function AuthHashHandler() {
  const router = useRouter();
  const [processed, setProcessed] = useState(false);

  useEffect(() => {
    // Only run on client side and only once
    if (typeof window === "undefined" || processed) return;

    const handleHashFragment = async () => {
      const hash = window.location.hash;

      // Check if we have auth tokens in the hash
      if (hash && hash.includes("access_token=")) {
        console.log("[AuthHashHandler] Detected auth tokens in hash fragment");
        setProcessed(true);

        try {
          // Parse the hash fragment
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get("access_token");
          const refreshToken = hashParams.get("refresh_token");

          if (accessToken && refreshToken) {
            console.log("[AuthHashHandler] Setting session with tokens from hash");

            // Set the session using the tokens from the hash
            const { data, error } = await supabaseClient.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              console.error("[AuthHashHandler] Error setting session:", error);
            } else if (data.session) {
              console.log("[AuthHashHandler] ✅ Session created successfully!");
              console.log("[AuthHashHandler] User:", data.session.user.email);

              // Clean up the URL by removing the hash fragment
              const cleanUrl = window.location.pathname + window.location.search;
              window.history.replaceState({}, document.title, cleanUrl);

              // Refresh the page to update auth state
              router.refresh();
            }
          }
        } catch (error) {
          console.error("[AuthHashHandler] Error processing hash fragment:", error);
        }
      }
    };

    // Small delay to ensure the component is mounted
    const timer = setTimeout(handleHashFragment, 100);
    return () => clearTimeout(timer);
  }, [processed, router]);

  return null; // This component doesn't render anything
}
