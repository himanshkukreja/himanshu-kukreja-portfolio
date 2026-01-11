"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabase-client";

/**
 * Client-side OAuth callback handler
 * This page processes the OAuth redirect and ensures the session is saved to localStorage
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Processing authentication...');

  useEffect(() => {
    async function handleCallback() {
      try {
        console.log('[AuthCallback Page] Processing OAuth callback...');

        // Get the code from URL params (OAuth callback)
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          console.error('[AuthCallback Page] Auth error:', error, errorDescription);
          setStatus('error');
          setMessage(errorDescription || error);
          setTimeout(() => router.push('/'), 3000);
          return;
        }

        if (code) {
          console.log('[AuthCallback Page] Code found, exchanging for session...');

          // Exchange the code for a session
          const { data, error: exchangeError } = await supabaseClient.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error('[AuthCallback Page] Exchange error:', exchangeError);
            setStatus('error');
            setMessage('Failed to complete authentication');
            setTimeout(() => router.push('/'), 3000);
            return;
          }

          if (data?.session) {
            console.log('[AuthCallback Page] ✅ Session created successfully!');
            console.log('[AuthCallback Page] User:', data.user?.email);

            // Ensure session is saved to localStorage
            await supabaseClient.auth.setSession({
              access_token: data.session.access_token,
              refresh_token: data.session.refresh_token,
            });

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
            console.error('[AuthCallback Page] No session data received');
            setStatus('error');
            setMessage('No session created');
            setTimeout(() => router.push('/'), 3000);
          }
        } else {
          // No code in URL - might be coming from hash fragment (implicit flow)
          console.log('[AuthCallback Page] No code in URL, checking hash...');

          // Check if Supabase already has a session (from hash fragment)
          const { data: { session } } = await supabaseClient.auth.getSession();

          if (session) {
            console.log('[AuthCallback Page] ✅ Session found in Supabase client');
            setStatus('success');
            setMessage('Authentication successful! Redirecting...');

            const redirectPath = localStorage.getItem('auth_redirect_path') || '/';
            localStorage.removeItem('auth_redirect_path');

            setTimeout(() => {
              router.push(redirectPath);
              router.refresh();
            }, 1000);
          } else {
            console.warn('[AuthCallback Page] No code or session found');
            setStatus('error');
            setMessage('No authentication data received');
            setTimeout(() => router.push('/'), 3000);
          }
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
