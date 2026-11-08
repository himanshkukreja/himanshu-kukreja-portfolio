import "server-only";

/**
 * Signs and sends a request to judge-lite (services/judge on the judge branch; this is its client/judge-client.ts,
 * copied so the site doesn't import from the service). Web Crypto only, so it runs unchanged in the Cloudflare Worker
 * and in Node. The secret never leaves the server.
 *
 *   canonical = "v1\n" + timestamp + "\n" + nonce + "\n" + METHOD + "\n" + path + "\n" + hex(sha256(body))
 *   X-Judge-Signature: "v1=" + hex(HMAC-SHA256(secret, canonical)), plus X-Judge-Timestamp, X-Judge-Nonce, X-Judge-Key-Id
 *
 * Env: JUDGE_URL, JUDGE_HMAC_SECRET (>= 32 chars), JUDGE_KEY_ID (optional: "staging" / "prod").
 */

export interface JudgeEnv {
  JUDGE_URL: string;
  JUDGE_HMAC_SECRET: string;
  JUDGE_KEY_ID?: string;
}

/** The judge's env, or null when it isn't configured (Java and C++ judging then reports "coming soon"). */
export function judgeEnv(): JudgeEnv | null {
  const url = process.env.JUDGE_URL;
  const secret = process.env.JUDGE_HMAC_SECRET;
  if (!url || !secret || secret.length < 32) return null;
  return { JUDGE_URL: url, JUDGE_HMAC_SECRET: secret, JUDGE_KEY_ID: process.env.JUDGE_KEY_ID || undefined };
}

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomNonce(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function signJudgeRequest(opts: { secret: string; keyId?: string; method: string; path: string; body: string; nowSec?: number; nonce?: string }): Promise<Record<string, string>> {
  const ts = String(opts.nowSec ?? Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? randomNonce();
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", enc.encode(opts.body)));
  const canonical = `v1\n${ts}\n${nonce}\n${opts.method.toUpperCase()}\n${opts.path}\n${bodyHash}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(opts.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, enc.encode(canonical)));
  const h: Record<string, string> = { "x-judge-timestamp": ts, "x-judge-nonce": nonce, "x-judge-signature": `v1=${mac}` };
  if (opts.keyId) h["x-judge-key-id"] = opts.keyId;
  return h;
}

export interface JudgeCallResult<T = unknown> {
  status: number;
  retryAfterSec?: number;
  body: T;
}

export async function callJudge<T = unknown>(env: JudgeEnv, payload: unknown, opts: { path?: string; timeoutMs?: number } = {}): Promise<JudgeCallResult<T>> {
  const path = opts.path ?? "/judge";
  const body = JSON.stringify(payload);
  const headers = await signJudgeRequest({ secret: env.JUDGE_HMAC_SECRET, keyId: env.JUDGE_KEY_ID, method: "POST", path, body });
  headers["content-type"] = "application/json";
  const res = await fetch(env.JUDGE_URL.replace(/\/+$/, "") + path, { method: "POST", headers, body, signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000), cache: "no-store" });
  const retry = res.headers.get("retry-after");
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep the text
  }
  return { status: res.status, retryAfterSec: retry ? Number(retry) : undefined, body: parsed as T };
}
