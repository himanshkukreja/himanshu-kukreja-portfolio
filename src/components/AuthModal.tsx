"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Mail, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { signInWithEmail, signUpWithEmail, verifyOtp, signInWithGoogle } from "@/lib/supabase-client";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type AuthStep = "email" | "otp" | "success";

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const handleClose = () => {
    setEmail("");
    setOtp("");
    setStep("email");
    setError(null);
    setSuccess(null);
    onClose();
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Always use signInWithOtp - Supabase will auto-create user if not exists
      const { error } = await signInWithEmail(email);

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setSuccess("Check your email for the verification code!");
      setStep("otp");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error } = await verifyOtp(email, otp);

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setSuccess("Successfully signed in!");
      setStep("success");

      // Close modal after 1.5 seconds
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // Google OAuth will redirect, so we don't need to handle success here
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google");
      setLoading(false);
    }
  };

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto"
        onClick={handleClose}
      >
        {/* Modal - Click inside doesn't close */}
        <div
          className="w-full max-w-md max-h-[95vh] my-auto overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-gradient-to-b from-gray-900 to-black border border-white/20 rounded-2xl shadow-2xl overflow-hidden relative min-h-0">
            {/* Decorative gradient top */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500" />
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">
                Continue Learning
              </h2>
              <p className="text-sm text-white/50">
                Sign in to unlock your progress and features
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white/60 hover:text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Success/Error Messages */}
            {success && (
              <div className="mb-4 p-3 bg-green-500/20 border border-green-500/30 rounded-lg flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0" />
                <p className="text-sm text-green-400">{success}</p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Step 1: Email Input */}
            {step === "email" && (
              <>
                <div className="mb-6">
                  <div className="flex items-start gap-2 text-white/70 text-sm">
                    <span className="text-blue-400">✓</span>
                    <p>Track your progress and earn streaks</p>
                  </div>
                  <div className="flex items-start gap-2 text-white/70 text-sm mt-2">
                    <span className="text-blue-400">✓</span>
                    <p>Bookmark lessons and take notes</p>
                  </div>
                  <div className="flex items-start gap-2 text-white/70 text-sm mt-2">
                    <span className="text-blue-400">✓</span>
                    <p>100% free, no credit card required</p>
                  </div>
                </div>

                {/* Google Sign In */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-white/10 hover:bg-white/15 text-white border border-white/20 hover:border-white/30 rounded-xl transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed mb-4 shadow-lg hover:shadow-xl"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </button>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/20"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-4 bg-gradient-to-b from-gray-900 to-black text-white/50 uppercase tracking-wider">or</span>
                  </div>
                </div>

                {/* Email Form */}
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-white mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        disabled={loading}
                        className="w-full pl-12 pr-4 py-3.5 bg-white/5 border border-white/20 rounded-xl text-white placeholder:text-white/40 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-white/30"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Sending code...
                      </>
                    ) : (
                      `Continue with Email`
                    )}
                  </button>
                </form>

                {/* Info Text */}
                <div className="mt-6 text-center text-sm text-white/50">
                  We'll create your account automatically if you're new
                </div>
              </>
            )}

            {/* Step 2: OTP Verification */}
            {step === "otp" && (
              <>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/20 rounded-full mb-4">
                    <Mail className="w-8 h-8 text-blue-400" />
                  </div>
                  <p className="text-white/70 text-sm">
                    We sent a 6-digit code to<br />
                    <span className="text-white font-semibold">{email}</span>
                  </p>
                </div>

                <form onSubmit={handleOtpSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="otp" className="block text-sm font-semibold text-white mb-3 text-center">
                      Enter Verification Code
                    </label>
                    <input
                      id="otp"
                      type="text"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      placeholder="• • • • • •"
                      maxLength={6}
                      required
                      disabled={loading}
                      autoFocus
                      className="w-full px-4 py-4 bg-white/5 border-2 border-white/20 rounded-xl text-white text-center text-3xl font-bold tracking-[0.5em] placeholder:text-white/30 placeholder:tracking-[0.5em] focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-white/30"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify Code"
                    )}
                  </button>
                </form>

                {/* Resend Code */}
                <div className="mt-4 text-center text-sm">
                  <span className="text-white/60">Didn't receive the code?</span>{" "}
                  <button
                    onClick={() => setStep("email")}
                    className="text-blue-400 hover:text-blue-300 font-medium"
                  >
                    Try again
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Success */}
            {step === "success" && (
              <div className="text-center py-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                  <CheckCircle className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Welcome!</h3>
                <p className="text-white/70">You're all set. Redirecting...</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-black/30 border-t border-white/10 text-center text-xs text-white/40">
            By continuing, you agree to our{" "}
            <span className="text-white/60">Terms of Service</span> and{" "}
            <span className="text-white/60">Privacy Policy</span>
          </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
