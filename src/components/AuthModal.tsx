"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X, Mail, CheckCircle, AlertCircle } from "lucide-react";
import { signInWithEmail, verifyOtp, signInWithGoogle } from "@/lib/supabase-client";
import { BootLoader, Spinner } from "@/components/ui/loader";

type AuthModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type AuthStep = "email" | "otp" | "success";
type Busy = null | "google" | "email" | "otp";

const noopSubscribe = () => () => {};

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [step, setStep] = useState<AuthStep>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const loading = busy !== null;
  const setLoading = (v: Busy | false) => setBusy(v || null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  // portal target only exists on the client
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

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
    setLoading("email");
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
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("otp");
    setError(null);

    try {
      const { error } = await verifyOtp(email, otp);

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setSuccess(null);
      setStep("success");

      // Close modal after 1.5 seconds
      setTimeout(() => {
        handleClose();
      }, 1500);
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading("google");
    setError(null);

    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // Google OAuth will redirect, so we don't need to handle success here
    } catch (err: unknown) {
      setError((err instanceof Error && err.message) || "Failed to sign in with Google");
      setLoading(false);
    }
  };

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4 overflow-y-auto"
        onClick={handleClose}
      >
        {/* Modal - Click inside doesn't close */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sign in"
          className="w-full max-w-md max-h-[95vh] my-auto overflow-y-auto animate-hk-in"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") handleClose();
          }}
        >
          <div className="bg-surface border border-line-strong overflow-hidden relative min-h-0">
            {/* Decorative gradient top */}
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-signal" />
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-line">
            <div>
              <h2 className="font-display text-3xl font-extrabold tracking-[-0.03em] text-fg mb-1">
                Continue Learning
              </h2>
              <p className="text-sm text-fg-3">
                Sign in to unlock your progress and features
              </p>
            </div>
            <button
              onClick={handleClose}
              className="grid h-10 w-10 place-items-center hover:bg-surface-2"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-fg-3 hover:text-fg" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Success/Error Messages */}
            {success && (
              <div className="mb-4 p-3 border border-ok flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-ok flex-shrink-0" />
                <p className="text-sm text-ok">{success}</p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 border border-bad flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-bad-text flex-shrink-0" />
                <p className="text-sm text-bad-text">{error}</p>
              </div>
            )}

            {/* Step 1: Email Input */}
            {step === "email" && (
              <>
                <div className="mb-6">
                  <div className="flex items-start gap-2 text-fg-2 text-sm">
                    <span className="text-signal-text">✓</span>
                    <p>Track your progress and earn streaks</p>
                  </div>
                  <div className="flex items-start gap-2 text-fg-2 text-sm mt-2">
                    <span className="text-signal-text">✓</span>
                    <p>Bookmark lessons and take notes</p>
                  </div>
                  <div className="flex items-start gap-2 text-fg-2 text-sm mt-2">
                    <span className="text-signal-text">✓</span>
                    <p>100% free, no credit card required</p>
                  </div>
                </div>

                {/* Google Sign In */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3.5 bg-fg text-bg hover:opacity-90 transition-opacity font-semibold min-h-12 disabled:opacity-50 disabled:cursor-not-allowed mb-4"
                >
                  {busy === "google" ? (
                    <>
                      <Spinner />
                      <span className="font-mono text-sm">redirecting to google…</span>
                    </>
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
                    <div className="w-full border-t border-line"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-4 bg-surface text-fg-3 font-mono uppercase tracking-label">or</span>
                  </div>
                </div>

                {/* Email Form */}
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-semibold text-fg mb-2">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-fg-4" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        required
                        disabled={loading}
                        className="w-full pl-12 pr-4 min-h-12 bg-bg border border-line-strong text-fg placeholder:text-fg-4 focus:outline-none focus:border-signal disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !email}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-signal text-on-signal hover:opacity-90 transition-opacity font-semibold min-h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy === "email" ? (
                      <>
                        <Spinner />
                        <span className="font-mono text-sm">sending code…</span>
                      </>
                    ) : (
                      `Continue with Email`
                    )}
                  </button>
                </form>

                {/* Info Text */}
                <div className="mt-6 text-center text-sm text-fg-3">
                  We&apos;ll create your account automatically if you&apos;re new
                </div>
              </>
            )}

            {/* Step 2: OTP Verification */}
            {step === "otp" && (
              <>
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 border border-signal mb-4">
                    <Mail className="w-8 h-8 text-signal-text" />
                  </div>
                  <p className="text-fg-2 text-sm">
                    We sent a 6-digit code to<br />
                    <span className="text-fg font-semibold">{email}</span>
                  </p>
                </div>

                <form onSubmit={handleOtpSubmit} className="space-y-5">
                  <div>
                    <label htmlFor="otp" className="block text-sm font-semibold text-fg mb-3 text-center">
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
                      className="w-full px-4 py-4 bg-bg border border-line-strong text-fg text-center font-mono text-3xl font-semibold tracking-[0.5em] placeholder:text-fg-4 placeholder:tracking-[0.5em] focus:outline-none focus:border-signal disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading || otp.length !== 6}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3.5 bg-signal text-on-signal hover:opacity-90 transition-opacity font-semibold min-h-12 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy === "otp" ? (
                      <>
                        <Spinner />
                        <span className="font-mono text-sm">verifying…</span>
                      </>
                    ) : (
                      "Verify Code"
                    )}
                  </button>
                </form>

                {/* Resend Code */}
                <div className="mt-4 text-center text-sm">
                  <span className="text-fg-3">Didn&apos;t receive the code?</span>{" "}
                  <button
                    onClick={() => setStep("email")}
                    className="text-signal-text hover:underline font-medium"
                  >
                    Try again
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Success */}
            {step === "success" && (
              <div className="flex flex-col gap-4 py-2">
                <h3 className="m-0 font-display text-3xl font-extrabold tracking-[-0.03em] text-fg">
                  Welcome in<span className="text-signal-text">.</span>
                </h3>
                <BootLoader
                  label="Signing you in"
                  cmd={`ssh ${email.split("@")[0] || "you"}@himanshu`}
                  steps={["code verified", "session saved", "syncing your progress"]}
                  className="max-w-none"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 bg-raised border-t border-line text-center text-xs text-fg-3">
            By continuing, you agree to our{" "}
            <span className="text-fg-3">Terms of Service</span> and{" "}
            <span className="text-fg-3">Privacy Policy</span>
          </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
