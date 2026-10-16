import "server-only";
import { NextResponse } from "next/server";
import { POSTHOG_PROJECT_ID_DEFAULT, POSTHOG_PROXY_PATH, POSTHOG_REGION, POSTHOG_REGION_SET, POSTHOG_UI_HOST, gaEnabled, posthogEnabled } from "./config";
import type { NotConfigured, PhStatus } from "./journeys";

/**
 * Server-side PostHog API client for /admin/journeys. Uses the personal API key (phx_…), which
 * never leaves the server. Scopes needed: query:read, person:read, session_recording:read,
 * sharing_configuration:read + :write (to embed replays).
 *
 * - HogQL: POST {host}/api/projects/{id}/query/ { query: { kind: "HogQLQuery", query, values } }
 * - Replays: GET {host}/api/projects/{id}/session_recordings/
 * - Sharing (embed): PATCH {host}/api/projects/{id}/session_recordings/{sid}/sharing/ { enabled: true }
 *   → access_token → iframe {host}/embedded/{access_token}
 *
 * PostHog's query API allows 3 concurrent queries and 240/min per project: requests here go
 * through a 3-slot queue and results are cached in memory for a short TTL.
 */

const key = () => (process.env.POSTHOG_PERSONAL_API_KEY || "").trim();
const projectId = () => {
  const v = (process.env.POSTHOG_PROJECT_ID || POSTHOG_PROJECT_ID_DEFAULT || "").trim();
  return /^\d+$/.test(v) ? v : "";
};
/** Private API host; defaults to the region's app host (us.posthog.com / eu.posthog.com). */
const apiHost = () => (process.env.POSTHOG_API_HOST || POSTHOG_UI_HOST).replace(/\/$/, "");

export function phStatus(): PhStatus {
  const missing: string[] = [];
  if (!posthogEnabled()) missing.push("NEXT_PUBLIC_POSTHOG_KEY");
  if (!POSTHOG_REGION_SET) missing.push("NEXT_PUBLIC_POSTHOG_HOST");
  if (!key()) missing.push("POSTHOG_PERSONAL_API_KEY");
  if (!projectId()) missing.push("POSTHOG_PROJECT_ID");
  if (!gaEnabled()) missing.push("NEXT_PUBLIC_GA_ID");
  return {
    configured: !!key() && !!projectId(),
    capture: posthogEnabled(),
    ga: gaEnabled(),
    region: POSTHOG_REGION,
    uiHost: POSTHOG_UI_HOST,
    projectId: projectId() || null,
    proxyPath: POSTHOG_PROXY_PATH,
    missing,
  };
}

/** For routes: `const nc = notConfigured(); if (nc) return nc;` → 200 { configured:false, status }. */
export function notConfigured(): NextResponse<NotConfigured> | null {
  const s = phStatus();
  return s.configured ? null : NextResponse.json({ configured: false, status: s });
}

export const appUrl = (path: string) => `${POSTHOG_UI_HOST}/project/${projectId()}${path}`;

/* ───────────────────────────── transport ───────────────────────────── */

export class PhError extends Error {
  /** status we answer with (never 401/403: those would log the admin out; 424 = missing scope) */
  status: number;
  /** PostHog's own HTTP status, when it answered */
  upstream: number;
  /** personal-API-key scope PostHog asked for (403) */
  scope: string | null;
  constructor(message: string, status: number, upstream = 0, scope: string | null = null) {
    super(message);
    this.status = status;
    this.upstream = upstream;
    this.scope = scope;
  }
}

/** Scope each private API path needs (used when PostHog's 403 doesn't name it). */
function scopeFor(path: string, method: string): string {
  if (path.startsWith("/query")) return "query:read";
  if (path.includes("/sharing")) return method === "GET" ? "sharing_configuration:read" : "sharing_configuration:write";
  if (path.startsWith("/session_recordings")) return "session_recording:read";
  if (path.startsWith("/persons")) return "person:read";
  return "project:read";
}

let active = 0;
const waiting: (() => void)[] = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 3) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

export async function phFetch<T>(path: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const url = `${apiHost()}/api/projects/${projectId()}${path}`;
  const res = await slot(() =>
    fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers || {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })
  ).catch((e: Error) => {
    throw new PhError(e?.name === "TimeoutError" ? "PostHog took too long to answer" : `Can't reach PostHog: ${e?.message || e}`, 504);
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail = (body as { detail?: string; error?: string } | null)?.detail || (body as { error?: string } | null)?.error || text.slice(0, 200);
    const u = res.status;
    if (u === 401) throw new PhError("PostHog rejected POSTHOG_PERSONAL_API_KEY (revoked, or the wrong region?)", 502, u);
    if (u === 403) {
      const scope = (String(detail).match(/\b([a-z_]+:(?:read|write))\b/) || [])[1] || scopeFor(path, String(init.method || "GET").toUpperCase());
      throw new PhError(`The personal API key is missing the “${scope}” scope. Add it in PostHog → Account settings → Personal API keys → edit.`, 424, u, scope);
    }
    if (u === 404) throw new PhError(`PostHog: not found (${detail || "check POSTHOG_PROJECT_ID"})`, 502, u);
    if (u === 429) throw new PhError("PostHog rate limit hit, try again in a minute", 429, u);
    throw new PhError(`PostHog ${u}: ${detail}`, 502, u);
  }
  return body as T;
}

/* ───────────────────────────── cache ───────────────────────────── */

const cache = new Map<string, { at: number; ttl: number; value: Promise<unknown> }>();

export function cached<T>(k: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(k);
  if (hit && now - hit.at < hit.ttl) return hit.value as Promise<T>;
  const value = fn();
  cache.set(k, { at: now, ttl: ttlMs, value });
  value.catch(() => cache.delete(k));
  if (cache.size > 300) {
    for (const [ck, v] of cache) if (now - v.at > v.ttl) cache.delete(ck);
  }
  return value;
}

export const uncache = (k: string) => cache.delete(k);

/* ───────────────────────────── HogQL ───────────────────────────── */

export type Row = unknown[];

/**
 * Run a HogQL query. `values` fill `{name}` placeholders (strings are escaped by PostHog).
 * Numbers that go into INTERVALs/LIMITs are inlined by the caller after validation.
 */
export async function hogql(query: string, opts: { values?: Record<string, string | number>; name: string; ttlMs?: number }): Promise<Row[]> {
  const body = JSON.stringify({ query: { kind: "HogQLQuery", query, ...(opts.values ? { values: opts.values } : {}) }, name: `admin_journeys_${opts.name}` });
  const once = async () => {
    const r = await phFetch<{ results?: Row[]; error?: string }>("/query/", { method: "POST", body });
    if (r?.error) throw new PhError(`HogQL: ${r.error}`, 502);
    return r?.results ?? [];
  };
  return cached(`q:${body}`, opts.ttlMs ?? 30_000, async () => {
    try {
      return await once();
    } catch (e) {
      // PostHog sometimes answers a fresh/cold project with a server error or "max execution time": retry once
      const pe = e as PhError;
      const transient = pe?.upstream >= 500 || /execution time|timeout|took too long|server_error/i.test(pe?.message || "");
      if (!transient) throw e;
      await new Promise((r) => setTimeout(r, 1500));
      return once().catch((e2: PhError) => {
        throw new PhError(`PostHog query timed out (${e2?.message || "server error"}). Try again in a minute.`, 504, e2?.upstream || 0);
      });
    }
  });
}

/* ───────────────────────────── helpers ───────────────────────────── */

export const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
export const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const iso = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  const d = new Date(typeof v === "number" ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** PostHog ids we inline: person UUIDs and session ids (UUIDv7) are hex + dashes. */
export const isUuid = (v: string | null | undefined): boolean => !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export const clampDays = (v: string | null, fallback = 30) => {
  const n = Number(v);
  return [1, 7, 30, 90].includes(n) ? n : fallback;
};

/** Events never shown in journeys (internal / very high volume). */
export const NOISE = "('$snapshot', '$heatmap', '$$heatmap', '$feature_flag_called', '$web_vitals', '$set', '$groupidentify', '$identify', '$opt_in', '$pageleave', '$dead_clicks_get_config', '$feature_view', '$feature_interaction')";

/** JSON route error helper. */
export function phErrorResponse(e: unknown) {
  const err = e instanceof PhError ? e : new PhError(e instanceof Error ? e.message : String(e), 500);
  return NextResponse.json({ error: err.message, scope: err.scope }, { status: err.status >= 400 && err.status < 600 ? err.status : 500 });
}

/** Message for a failed sub-request we degrade instead of failing the whole response. */
export const softError = (e: unknown) => (e instanceof PhError ? { error: e.message, scope: e.scope } : { error: e instanceof Error ? e.message : String(e), scope: null });
