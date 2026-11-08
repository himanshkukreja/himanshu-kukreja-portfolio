// HMAC request authentication (server side).
//
// The Worker signs every request:
//   X-Judge-Key-Id:     which shared secret (e.g. "prod" or "staging"); optional, default "default"
//   X-Judge-Timestamp:  unix seconds
//   X-Judge-Nonce:      16-64 chars [A-Za-z0-9_-], unique per request
//   X-Judge-Signature:  "v1=" + hex(HMAC-SHA256(secret, canonical))
//
//   canonical = "v1\n" + timestamp + "\n" + nonce + "\n" + METHOD + "\n" + path + "\n" + hex(SHA-256(body))
//
// The server rejects timestamps outside +/- maxSkewSec and nonces it has seen
// within that window (replay protection), then compares in constant time.
// client/judge-client.ts is the matching signer (Web Crypto, runs in Workers).

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const HEADER_KEY_ID = "x-judge-key-id";
export const HEADER_TIMESTAMP = "x-judge-timestamp";
export const HEADER_NONCE = "x-judge-nonce";
export const HEADER_SIGNATURE = "x-judge-signature";

const NONCE_RE = /^[A-Za-z0-9_-]{16,64}$/;
const KEY_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;

export function sha256Hex(body: Uint8Array | string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function canonicalString(ts: string, nonce: string, method: string, path: string, bodyHash: string): string {
  return `v1\n${ts}\n${nonce}\n${method.toUpperCase()}\n${path}\n${bodyHash}`;
}

export function sign(secret: string, ts: string, nonce: string, method: string, path: string, body: Uint8Array | string): string {
  const mac = createHmac("sha256", secret).update(canonicalString(ts, nonce, method, path, sha256Hex(body))).digest("hex");
  return `v1=${mac}`;
}

/** Remembers nonces for the skew window. Bounded so a flood cannot exhaust memory. */
export class NonceCache {
  private seen = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly max: number;
  constructor(ttlMs: number, max = 100_000) {
    this.ttlMs = ttlMs;
    this.max = max;
  }
  /** Returns false if the nonce was already used (or the cache is full of live nonces). */
  add(nonce: string, nowMs: number): boolean {
    this.sweep(nowMs);
    if (this.seen.has(nonce)) return false;
    if (this.seen.size >= this.max) return false;
    this.seen.set(nonce, nowMs + this.ttlMs);
    return true;
  }
  private sweep(nowMs: number): void {
    // Map iterates in insertion order, so expired entries are at the front.
    for (const [k, exp] of this.seen) {
      if (exp > nowMs) break;
      this.seen.delete(k);
    }
  }
  get size(): number {
    return this.seen.size;
  }
}

export interface VerifyOptions {
  secrets: Map<string, string>;
  maxSkewSec: number;
  nonces: NonceCache;
  nowMs?: number;
}

export type VerifyResult = { ok: true; keyId: string } | { ok: false; reason: string };

type Headers = Record<string, string | string[] | undefined>;

function header(h: Headers, name: string): string | undefined {
  const v = h[name];
  return Array.isArray(v) ? v[0] : v;
}

export function verifyRequest(
  headers: Headers,
  method: string,
  path: string,
  body: Uint8Array,
  opts: VerifyOptions,
): VerifyResult {
  const keyId = header(headers, HEADER_KEY_ID) ?? "default";
  const ts = header(headers, HEADER_TIMESTAMP);
  const nonce = header(headers, HEADER_NONCE);
  const sig = header(headers, HEADER_SIGNATURE);
  if (!ts || !nonce || !sig) return { ok: false, reason: "missing signature headers" };
  if (!KEY_ID_RE.test(keyId)) return { ok: false, reason: "bad key id" };
  const secret = opts.secrets.get(keyId);
  if (!secret) return { ok: false, reason: "unknown key id" };
  if (!/^\d{1,12}$/.test(ts)) return { ok: false, reason: "bad timestamp" };
  if (!NONCE_RE.test(nonce)) return { ok: false, reason: "bad nonce" };
  const now = opts.nowMs ?? Date.now();
  if (Math.abs(now / 1000 - Number(ts)) > opts.maxSkewSec) return { ok: false, reason: "timestamp outside window" };

  const expected = Buffer.from(sign(secret, ts, nonce, method, path, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "bad signature" };
  }
  // Only remember nonces of correctly signed requests, so junk cannot fill the cache.
  if (!opts.nonces.add(`${keyId}:${nonce}`, now)) return { ok: false, reason: "replayed nonce" };
  return { ok: true, keyId };
}

/**
 * Secrets from the environment:
 *   JUDGE_HMAC_SECRET=<secret>                      -> key id "default"
 *   JUDGE_HMAC_SECRETS=prod:<secret>,staging:<secret> (separate keys per environment, rotation)
 */
export function loadSecrets(env: Record<string, string | undefined>): Map<string, string> {
  const m = new Map<string, string>();
  if (env.JUDGE_HMAC_SECRET) m.set("default", env.JUDGE_HMAC_SECRET);
  for (const part of (env.JUDGE_HMAC_SECRETS ?? "").split(",")) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf(":");
    if (idx <= 0) throw new Error("JUDGE_HMAC_SECRETS entries must look like keyId:secret");
    const id = p.slice(0, idx);
    if (!KEY_ID_RE.test(id)) throw new Error(`bad key id "${id}" in JUDGE_HMAC_SECRETS`);
    m.set(id, p.slice(idx + 1));
  }
  for (const [id, s] of m) {
    if (s.length < 32) throw new Error(`HMAC secret "${id}" must be at least 32 characters`);
  }
  return m;
}
