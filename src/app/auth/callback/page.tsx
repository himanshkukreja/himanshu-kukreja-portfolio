"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabase-client";

/**
 * Loading fallback for Suspense
 */
function LoadingFallback() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
        <h1 className="text-2xl font-bold text-white mb-2">Loading...</h1>
      </div>
    </div>
  );
}

/**
 * Client-side OAuth callback handler content
 * This component processes the OAuth redirect and ensures the session is saved to localStorage
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    async function handleCallback() {
      try {
        console.log('[AuthCallback Page] Processing OAuth callback...');

        // Check for OAuth errors in URL
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          console.error('[AuthCallback Page] Auth error:', error, errorDescription);
          setStatus('error');
          setMessage(errorDescription || error);
          setTimeout(() => router.push('/'), 3000);
          return;
        }

        // CRITICAL: Don't manually exchange the code - Supabase client does this automatically
        // The auth.detectSessionInUrl config handles PKCE flow automatically
        // Just check if the session was created successfully

        console.log('[AuthCallback Page] Checking if session was created...');

        // Wait a moment for the automatic session creation to complete
        await new Promise(resolve => setTimeout(resolve, 500));

        // Check if Supabase already has a session (from automatic PKCE exchange)
        const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();

        if (sessionError) {
          console.error('[AuthCallback Page] Session error:', sessionError);
          setStatus('error');
          setMessage('Failed to retrieve session');
          setTimeout(() => router.push('/'), 3000);
          return;
        }

        if (session) {
          console.log('[AuthCallback Page] ✅ Session created successfully!');
          console.log('[AuthCallback Page] User:', session.user?.email);

          setStatus('success');
          setMessage('Authentication successful! Redirecting...');

          // Get the redirect path from localStorage or default to home
          const redirectPath = localStorage.getItem('auth_redirect_path') || '/';
          localStorage.removeItem('auth_redirect_path');

          console.log('[AuthCallback Page] Redirecting to:', redirectPath);

          // Redirect after a brief delay
          setTimeout(() => {
            router.push(redirectPath);
            router.refresh(); // Force refresh to update auth state
          }, 1000);
        } else {
          console.warn('[AuthCallback Page] No session found after callback');
          setStatus('error');
          setMessage('Authentication did not complete');
          setTimeout(() => router.push('/'), 3000);
        }
      } catch (err: any) {
        console.error('[AuthCallback Page] Exception:', err);
        setStatus('error');
        setMessage(err.message || 'An error occurred');
        setTimeout(() => router.push('/'), 3000);
      }
    }

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center max-w-md mx-auto px-4">
        {status === 'processing' && (
          <>
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Completing Sign In
            </h1>
            <p className="text-gray-400">{message}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Success!
            </h1>
            <p className="text-gray-400">{message}</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Authentication Failed
            </h1>
            <p className="text-gray-400 mb-4">{message}</p>
            <p className="text-sm text-gray-500">Redirecting to home...</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Main page component with Suspense wrapper
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
