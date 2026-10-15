"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabase-client";
import { FullScreenLoader } from "@/components/ui/loader";

type Status = "processing" | "success" | "error";

const BOOT_CMD = "ssh you@himanshu";
const BOOT_STEPS = ["provider said yes", "exchange code for a session", "load your progress"];

/** Only same-site paths: never bounce a fresh session to another origin. */
function safePath(p: string | null | undefined): string {
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.startsWith("/auth/callback")) return "/";
  return p;
}

function Fallback() {
  return <FullScreenLoader title="Signing you in." label="Signing you in" cmd={BOOT_CMD} steps={BOOT_STEPS} />;
}

/**
 * OAuth landing page. With PKCE the Supabase client exchanges `?code=` by itself on load
 * (detectSessionInUrl); tokens forwarded by AuthHashHandler (`?access_token=&refresh_token=`)
 * are stored with setSession. Then we hop back to where the visitor started.
 */
function AuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("processing");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState("/");

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const fail = (msg: string) => {
      if (cancelled) return;
      setStatus("error");
      setMessage(msg);
      later(() => router.replace("/"), 5000);
    };

    (async () => {
      try {
        const error = searchParams.get("error");
        if (error) return fail(searchParams.get("error_description") || error);

        const accessToken = searchParams.get("access_token");
        const refreshToken = searchParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error: setErr } = await supabaseClient.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (setErr) return fail(setErr.message);
        }

        // getSession waits for the client's own PKCE exchange of ?code= to finish
        const {
          data: { session },
          error: sessionError,
        } = await supabaseClient.auth.getSession();
        if (sessionError) return fail("Couldn't read the new session.");
        if (!session) return fail("The sign-in didn't complete. Try again from the sign-in button.");

        let stored: string | null = null;
        try {
          stored = localStorage.getItem("auth_redirect_path");
          localStorage.removeItem("auth_redirect_path");
        } catch {
          /* storage blocked */
        }
        const path = safePath(stored || searchParams.get("redirect"));
        if (cancelled) return;
        setTarget(path);
        setStatus("success");
        later(() => router.replace(path), 350);
      } catch (err: unknown) {
        fail(err instanceof Error ? err.message : "Something went wrong.");
      }
    })();

    return () => {
      cancelled = true;
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [searchParams, router]);

  if (status === "error") {
    return (
      <main className="grid min-h-[calc(100svh-var(--hk-header-h,64px))] place-items-center px-4 py-16">
        <div role="alert" className="flex w-full max-w-[460px] flex-col gap-5">
          <p className="m-0 font-display text-[clamp(28px,6vw,40px)] font-extrabold leading-none tracking-[-0.04em] text-fg">
            Sign-in failed<span className="text-signal-text">.</span>
          </p>
          <div className="border border-line-strong bg-surface font-mono text-[13px] leading-6">
            <div className="border-b border-line px-3.5 py-2 text-[11px] uppercase tracking-label text-fg-3">~/himanshu · exit 1</div>
            <div className="flex flex-col px-3.5 py-3">
              <span>
                <span className="text-signal-text">~/himanshu</span> <span className="text-fg-4">$</span> <span className="text-fg">{BOOT_CMD}</span>
              </span>
              <span className="break-words text-bad-text">[err] {message}</span>
              <span className="text-fg-3">sending you home in 5s…</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/" className="inline-flex min-h-11 items-center bg-signal px-5 font-mono text-sm font-semibold text-on-signal hover:brightness-110">
              cd ~
            </Link>
            <Link href="/learn" className="inline-flex min-h-11 items-center border border-line-strong px-5 font-mono text-sm text-fg hover:bg-surface-2">
              open the course
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <FullScreenLoader
      title={status === "success" ? "Welcome in." : "Signing you in."}
      label={status === "success" ? "Signed in, redirecting" : "Signing you in"}
      cmd={BOOT_CMD}
      steps={status === "success" ? [...BOOT_STEPS.slice(0, 2), `cd ${target}`] : BOOT_STEPS}
    />
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AuthCallbackContent />
    </Suspense>
  );
}
