/**
 * Third-party analytics config (PostHog + Google Analytics 4). Each tool is dormant until its key
 * exists (env or the HARDCODED defaults below): no script, no request, no proxy route. PostHog's
 * public project token + project id and the GA4 measurement id are hard-coded below (live); clear
 * them (and the env vars) to make a tool dormant again.
 *
 * Public values (safe in the browser bundle). Set them as env vars (Vercel → Settings → Environment
 * Variables, then redeploy: NEXT_PUBLIC_* values are inlined at build time) — or hard-code them in
 * the HARDCODED block below instead of using env:
 *   NEXT_PUBLIC_POSTHOG_KEY   phc_…  PostHog → Project settings → General → "Project API key"
 *   NEXT_PUBLIC_POSTHOG_HOST  "us" | "eu" (or https://us.i.posthog.com / https://eu.i.posthog.com)
 *   NEXT_PUBLIC_GA_ID         G-…    GA4 → Admin → Data streams → Web → "Measurement ID"
 *
 * Server-only secrets for /admin/journeys (never NEXT_PUBLIC, read at request time):
 *   POSTHOG_PERSONAL_API_KEY  phx_…  PostHog → Settings → Personal API keys
 *   POSTHOG_PROJECT_ID        number PostHog → Project settings → General → "Project ID"
 *
 * This file has no imports on purpose: next.config.ts imports it to decide the proxy rewrites.
 */

/**
 * Hard-coded defaults (env vars override them). Public values only: the phc_ project token and
 * the project id are designed to be public. Never put the phx_ personal API key here.
 */
const HARDCODED = {
  posthogKey: "phc_ntWNrq6mBdGf7hfuJg6hfT83JVZkvKMArB34AxXBN5U2",
  posthogRegion: "us" as "" | "us" | "eu",
  posthogProjectId: "667879",
  gaId: "G-2H8KRR4YHV",
};

/**
 * First-party path the PostHog SDK talks to; next.config.ts rewrites it to PostHog. Deliberately
 * neutral: "/ingest", "/posthog", "/analytics", "/track", "/ph" are on common blocklists.
 */
export const POSTHOG_PROXY_PATH = "/hkr";

export type PosthogRegion = "us" | "eu";

function regionOf(raw: string | undefined): PosthogRegion {
  const v = (raw || "").trim().toLowerCase();
  return v === "eu" || v.includes("eu.") || v.includes("eu-") ? "eu" : "us";
}

const KEY = (process.env.NEXT_PUBLIC_POSTHOG_KEY || HARDCODED.posthogKey || "").trim();
const REGION = regionOf(process.env.NEXT_PUBLIC_POSTHOG_HOST || HARDCODED.posthogRegion);
const GA = (process.env.NEXT_PUBLIC_GA_ID || HARDCODED.gaId || "").trim();

/** Project API key, or "" when PostHog isn't set up (a malformed key counts as unset). */
export const POSTHOG_KEY = /^phc_[A-Za-z0-9_-]{8,}$/.test(KEY) ? KEY : "";
export const POSTHOG_REGION: PosthogRegion = REGION;
/** Ingestion host (events, flags, recordings). */
export const POSTHOG_INGEST_HOST = `https://${REGION}.i.posthog.com`;
/** Static assets host (array.js, recorder.js, surveys…). */
export const POSTHOG_ASSETS_HOST = `https://${REGION}-assets.i.posthog.com`;
/** App / UI host (toolbar, links, embedded replays, private API). */
export const POSTHOG_UI_HOST = `https://${REGION}.posthog.com`;

/** GA4 measurement id, or "" when unset/malformed. */
export const GA_ID = /^G-[A-Z0-9]{4,}$/i.test(GA) ? GA.toUpperCase() : "";

/** Project id for the private API (server side): env POSTHOG_PROJECT_ID, else the default above. */
export const POSTHOG_PROJECT_ID_DEFAULT = HARDCODED.posthogProjectId;
/** true when the region came from env or the hard-coded default (not just the "us" fallback). */
export const POSTHOG_REGION_SET = !!(process.env.NEXT_PUBLIC_POSTHOG_HOST || HARDCODED.posthogRegion);

export const posthogEnabled = () => POSTHOG_KEY !== "";
export const gaEnabled = () => GA_ID !== "";
