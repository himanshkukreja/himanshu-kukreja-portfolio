"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { mountGoogleButton } from "@/lib/auth/googleIdentity";
import { Spinner } from "@/components/ui/loader";

/**
 * Google's own "Continue with Google" button (Google Identity Services). Signs in on
 * himanshukukreja.in and hands the ID token to Supabase. If Google's script can't load, the
 * caller's classic redirect flow (`onFallback`) is offered instead.
 */
export default function GoogleIdButton({ onDone, onError, onFallback }: { onDone: () => void; onError: (m: string) => void; onFallback: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();
  const [state, setState] = useState<"loading" | "ready" | "signing" | "failed">("loading");
  const cbs = useRef({ onDone, onError });
  useEffect(() => {
    cbs.current = { onDone, onError };
  }, [onDone, onError]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cleanup: (() => void) | null = null;
    let off = false;
    mountGoogleButton(el, {
      theme: resolvedTheme === "dark" ? "dark" : "light",
      width: el.parentElement?.clientWidth || 360,
      onStart: () => setState("signing"),
      onDone: () => cbs.current.onDone(),
      onError: (m) => {
        setState("ready");
        cbs.current.onError(m);
      },
    })
      .then((c) => {
        if (off) return c();
        cleanup = c;
        setState("ready");
      })
      .catch(() => !off && setState("failed"));
    return () => {
      off = true;
      cleanup?.();
    };
  }, [resolvedTheme]);

  return (
    <div className="mb-4 flex flex-col items-stretch gap-2">
      <div className="flex min-h-12 items-center justify-center">
        <div ref={ref} className={state === "signing" ? "hidden" : ""} />
        {state === "loading" && <Spinner />}
        {state === "signing" && (
          <span className="inline-flex items-center gap-2 font-mono text-sm text-fg-2">
            <Spinner /> signing you in…
          </span>
        )}
      </div>
      <button type="button" onClick={onFallback} className="self-center font-mono text-[11px] text-fg-3 underline-offset-2 hover:text-fg hover:underline">
        {state === "failed" ? "Google button didn't load · use classic Google sign-in" : "trouble signing in? use classic Google sign-in"}
      </button>
    </div>
  );
}
