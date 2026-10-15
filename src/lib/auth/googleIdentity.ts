"use client";

/**
 * "Sign in with Google" on our own domain (Google Identity Services), then
 * supabase.auth.signInWithIdToken. Google's account chooser then names himanshukukreja.in and
 * the app's name, instead of the Supabase project domain the OAuth redirect flow shows.
 *
 * Requires, in Google Cloud Console for this OAuth client: Authorized JavaScript origins
 * https://www.himanshukukreja.in, https://himanshukukreja.in (and http://localhost:3000 / :3100 for dev).
 * Until those exist GIS_ENABLED stays false and the classic redirect flow is used.
 */
import { supabaseClient } from "@/lib/supabase-client";

/** Public OAuth web client id (Supabase's Google provider lists it first, so ID tokens for it are accepted). */
export const GOOGLE_CLIENT_ID = "282795995682-5io18icb5lacgdglrt0ivp3fu1e4urcn.apps.googleusercontent.com";

/** On: the JavaScript origins above are authorised for this client. */
export const GIS_ENABLED = true;

type IdConfig = {
  client_id: string;
  nonce: string;
  callback: (r: { credential?: string }) => void;
  use_fedcm_for_prompt?: boolean;
  itp_support?: boolean;
  context?: "signin" | "signup" | "use";
  ux_mode?: "popup" | "redirect";
};
type GoogleId = {
  initialize(c: IdConfig): void;
  renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  cancel(): void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

let loading: Promise<GoogleId> | null = null;

function loadGis(): Promise<GoogleId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error("Google sign-in failed to load")));
      s.onerror = () => reject(new Error("Google sign-in failed to load"));
      document.head.appendChild(s);
    });
    loading.catch(() => (loading = null));
  }
  return loading;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Render Google's button into `el`. `onDone` runs after Supabase has a session; `onError` gets a
 * readable message. Returns a cleanup function.
 */
export async function mountGoogleButton(
  el: HTMLElement,
  opts: { theme: "light" | "dark"; width: number; onStart?: () => void; onDone: () => void; onError: (msg: string) => void }
): Promise<() => void> {
  const gis = await loadGis();
  // raw nonce goes to Supabase, its SHA-256 to Google (Supabase checks the pair)
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const hashed = await sha256Hex(raw);
  gis.initialize({
    client_id: GOOGLE_CLIENT_ID,
    nonce: hashed,
    context: "signin",
    ux_mode: "popup",
    itp_support: true,
    callback: async ({ credential }) => {
      if (!credential) return opts.onError("Google didn't return a sign-in token. Try again.");
      opts.onStart?.();
      const { error } = await supabaseClient.auth.signInWithIdToken({ provider: "google", token: credential, nonce: raw });
      if (error) opts.onError(error.message);
      else opts.onDone();
    },
  });
  gis.renderButton(el, {
    type: "standard",
    theme: opts.theme === "dark" ? "filled_black" : "outline",
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    width: Math.min(400, Math.max(200, Math.round(opts.width))),
  });
  return () => {
    try {
      gis.cancel();
    } catch {
      // ignore
    }
    el.replaceChildren();
  };
}
