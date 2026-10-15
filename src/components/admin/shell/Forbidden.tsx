"use client";

import Link from "next/link";
import { StageBar } from "@/components/ui/loader";

export type GateMode = "checking" | "signedOut" | "notAdmin" | "error";

/** "403 · sudo required" — what non-admins (and signed-out visitors) see at /admin. */
export default function Forbidden({
  mode,
  email,
  onSignIn,
  onSignOut,
  onRetry,
}: {
  mode: GateMode;
  email?: string | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
  onRetry?: () => void;
}) {
  const who = mode === "notAdmin" && email ? email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "") || "user" : "guest";
  const checking = mode === "checking";

  return (
    <main className="mx-auto w-full max-w-[1320px] px-4 py-10 sm:px-6 sm:py-16 lg:py-24">
      <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14">
        <div className="min-w-0">
          <div className="font-mono text-xs text-fg-3">
            <span className="text-signal-text">$</span> sudo open /admin
          </div>
          {checking ? (
            <>
              <h1 className="mt-3 font-display text-[44px] font-extrabold leading-[0.95] tracking-tightest text-fg sm:text-[64px]">
                checking sudo<span className="animate-hk-blink">_</span>
              </h1>
              <p className="mt-4 max-w-md text-[15px] text-fg-3">Verifying your session with the server.</p>
              <StageBar className="mt-6 h-2 w-full max-w-[320px]" />
            </>
          ) : (
            <>
              <h1 className="mt-3 font-display text-[56px] font-extrabold leading-[0.9] tracking-tightest text-fg sm:text-[88px]">
                403<span className="text-signal">_</span>
                <span className="mt-2 block text-[34px] leading-[1.05] tracking-tight sm:text-[48px]">sudo required</span>
              </h1>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-fg-2">
                {mode === "signedOut" && "This is the control room. Sign in with the admin account to continue."}
                {mode === "notAdmin" && (
                  <>
                    You&apos;re signed in as <span className="break-all font-mono text-fg">{email}</span>, which isn&apos;t on the admin list.
                  </>
                )}
                {mode === "error" && "Couldn't verify your session with the server. Check your connection and try again."}
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {mode === "signedOut" && (
                  <button type="button" onClick={onSignIn} className="min-h-11 bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110">
                    sudo login →
                  </button>
                )}
                {mode === "notAdmin" && (
                  <button type="button" onClick={onSignOut} className="min-h-11 bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110">
                    switch account
                  </button>
                )}
                {mode === "error" && (
                  <button type="button" onClick={onRetry} className="min-h-11 bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110">
                    ↻ retry
                  </button>
                )}
                <Link href="/" className="inline-flex min-h-11 items-center border border-line-strong px-5 font-mono text-sm text-fg hover:bg-surface-2">
                  cd ~
                </Link>
              </div>
            </>
          )}
        </div>

        <div className="min-w-0 border border-line-strong bg-surface" aria-hidden={checking || undefined}>
          <div className="flex items-center gap-2 border-b border-line px-3 py-2">
            <span className="h-2.5 w-2.5 bg-bad/80" />
            <span className="h-2.5 w-2.5 bg-signal/80" />
            <span className="h-2.5 w-2.5 bg-ok/80" />
            <span className="ml-2 font-mono text-[11px] uppercase tracking-label text-fg-3">tty1 · /admin</span>
          </div>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words px-4 py-4 font-mono text-[12.5px] leading-[1.75] text-fg-2 sm:text-[13px]">
            <span className="text-signal-text">{who}@himanshu</span>:<span className="text-fg-3">~</span>$ sudo open /admin{"\n"}
            {checking ? (
              <>
                [sudo] verifying session…{"\n"}
                <span className="inline-block h-3.5 w-2 translate-y-0.5 animate-hk-blink bg-signal" />
              </>
            ) : (
              <>
                [sudo] password for {who}: ••••••••{"\n"}
                {mode === "error" ? (
                  <span className="text-bad-text">sudo: unable to reach auth server{"\n"}</span>
                ) : (
                  <>
                    <span className="text-fg-3">Sorry, try again.</span>
                    {"\n"}
                    <span className="text-bad-text">{who} is not in the sudoers file.</span>
                    {"\n"}
                    <span className="text-fg-3">This incident will be reported.</span>
                    {"\n"}
                  </>
                )}
                <span className="text-signal-text">{who}@himanshu</span>:<span className="text-fg-3">~</span>${" "}
                <span className="inline-block h-3.5 w-2 translate-y-0.5 animate-hk-blink bg-signal" />
              </>
            )}
          </pre>
        </div>
      </div>
    </main>
  );
}
