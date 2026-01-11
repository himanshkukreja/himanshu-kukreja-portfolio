"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabaseClient, UserProfile, getCurrentUser, getUserProfile } from "@/lib/supabase-client";

// =====================================================
// Types
// =====================================================

type AuthContextType = {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

// =====================================================
// Context
// =====================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// =====================================================
// Provider Component
// =====================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false); // Use ref instead of state to avoid closure issues

  // Fetch user profile with retry logic
  const fetchProfile = async (userId: string, retryCount = 0) => {
    console.log(`[AuthContext] Fetching profile for user ${userId} (attempt ${retryCount + 1}/5)...`);

    const { data, error } = await getUserProfile(userId);

    if (error) {
      console.error("[AuthContext] Profile fetch error:", error);

      // If profile doesn't exist yet (PGRST116 = no rows returned), retry with exponential backoff
      // This can happen if the database trigger hasn't created the profile yet
      if (error.code === 'PGRST116' && retryCount < 5) {
        const delay = Math.min(1000 * Math.pow(1.5, retryCount), 5000); // Exponential backoff up to 5s
        console.log(`[AuthContext] Profile not found, retrying in ${delay}ms (${retryCount + 1}/5)...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchProfile(userId, retryCount + 1);
      }

      // For other errors, only retry a couple times
      if (retryCount < 2) {
        console.log(`[AuthContext] Retrying after error (${retryCount + 1}/2)...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        return fetchProfile(userId, retryCount + 1);
      }

      console.error("[AuthContext] Failed to fetch profile after retries:", error);
      return;
    }

    if (data) {
      console.log("[AuthContext] Profile loaded successfully:", { full_name: data.full_name, avatar_url: data.avatar_url });
      setProfile(data);
    } else if (retryCount < 5) {
      // If data is null but no error, retry with backoff
      const delay = Math.min(1000 * Math.pow(1.5, retryCount), 5000);
      console.log(`[AuthContext] Profile returned null, retrying in ${delay}ms (${retryCount + 1}/5)...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchProfile(userId, retryCount + 1);
    } else {
      console.error("[AuthContext] Profile is null after all retries");
    }
  };

  // Refresh profile manually
  const refreshProfile = async () => {
    if (!user?.id) return;
    await fetchProfile(user.id);
  };

  // Initialize auth state
  useEffect(() => {
    // Get initial session
    const initAuth = async () => {
      try {
        console.log("[AuthContext] Initializing auth...");

        const {
          data: { session },
        } = await supabaseClient.auth.getSession();

        console.log("[AuthContext] Session retrieved:", session ? "authenticated" : "not authenticated");

        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          console.log("[AuthContext] User found, fetching profile...");
          await fetchProfile(session.user.id);
          console.log("[AuthContext] Profile fetch complete");
        } else {
          console.log("[AuthContext] No user session");
        }
      } catch (error) {
        console.error("[AuthContext] Error initializing auth:", error);
      } finally {
        console.log("[AuthContext] Auth initialization complete, setting loading=false");
        setLoading(false);
        initializedRef.current = true;
      }
    };

    initAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(async (event, session) => {
      console.log("[AuthContext] Auth state changed:", event, session ? "authenticated" : "not authenticated");

      // Only set loading if we're already initialized to avoid blocking initial load
      if (initializedRef.current) {
        setLoading(true);
      }

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        console.log("[AuthContext] Fetching profile for auth state change...");
        await fetchProfile(session.user.id);

        // Send welcome email on first successful sign in
        if (event === "SIGNED_IN") {
          try {
            const response = await fetch("/api/send-welcome-email", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: session.user.id }),
            });

            const data = await response.json();
            if (data.success) {
              console.log("[AuthContext] Welcome email sent successfully");
            } else if (data.alreadySent) {
              console.log("[AuthContext] Welcome email already sent (returning user)");
            }
          } catch (error) {
            console.error("[AuthContext] Error sending welcome email:", error);
            // Don't block authentication if welcome email fails
          }
        }
      } else {
        console.log("[AuthContext] No session, clearing profile");
        setProfile(null);
      }

      // Always set loading to false after handling auth change
      if (initializedRef.current) {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []); // No dependencies needed - refs are stable

  // Sign out handler
  const handleSignOut = async () => {
    try {
      console.log("[AuthContext] Signing out...");

      // Try to sign out via Supabase
      try {
        await supabaseClient.auth.signOut();
      } catch (signOutError) {
        console.warn("[AuthContext] Supabase sign out failed, using manual cleanup:", signOutError);

        // Manual cleanup - clear localStorage directly
        const storageKey = "sb-jnvxizdhpecnydnvhell-auth-token";
        localStorage.removeItem(storageKey);

        // Also clear any other Supabase keys
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('sb-jnvxizdhpecnydnvhell')) {
            localStorage.removeItem(key);
          }
        });
      }

      // Clear state immediately
      setUser(null);
      setProfile(null);
      setSession(null);

      console.log("[AuthContext] Sign out successful");

      // Refresh the current page instead of redirecting to home
      window.location.reload();
    } catch (error) {
      console.error("[AuthContext] Failed to sign out:", error);
      // Force clear state even if sign out fails
      setUser(null);
      setProfile(null);
      setSession(null);
      window.location.reload();
    }
  };

  const value = {
    user,
    profile,
    session,
    loading,
    signOut: handleSignOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// =====================================================
// Hook to use auth context
// =====================================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// =====================================================
// Hook to require authentication
// =====================================================

export function useRequireAuth() {
  const { user, loading } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    if (!loading) {
      setIsAuthenticated(!!user);
    }
  }, [user, loading]);

  return { isAuthenticated, loading };
}
