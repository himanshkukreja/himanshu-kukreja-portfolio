// Worker-side client for judge-lite. Web Crypto only, so it runs unchanged in
// a Cloudflare Worker, Node 22+ and the browser (never ship the secret to a
// browser, though: only the Worker signs).
//
// Worker env:
//   JUDGE_URL          e.g. https://judge.systemdesignmastery.dev   (wrangler vars / secret)
//   JUDGE_HMAC_SECRET  shared secret, >= 32 chars                    (wrangler secret put)
//   JUDGE_KEY_ID       optional key id, e.g. "prod" or "staging"     (matches JUDGE_HMAC_SECRETS on the VM)
//
// Usage in a route handler:
//   const res = await callJudge(env, { language: "cpp", code, mode: "function", signature, tests, limits });
//   if (res.status === 503) -> tell the learner to retry after res.retryAfterSec

export interface JudgeEnv {
  JUDGE_URL: string;
  JUDGE_HMAC_SECRET: string;
  JUDGE_KEY_ID?: string;
}

const enc = new TextEncoder();

function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomNonce(): string {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signJudgeRequest(opts: {
  secret: string;
  keyId?: string;
  method: string;
  path: string;
  body: string;
  nowSec?: number;
  nonce?: string;
}): Promise<Record<string, string>> {
  const ts = String(opts.nowSec ?? Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? randomNonce();
  const bodyHash = hex(await crypto.subtle.digest("SHA-256", enc.encode(opts.body)));
  const canonical = `v1\n${ts}\n${nonce}\n${opts.method.toUpperCase()}\n${opts.path}\n${bodyHash}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(opts.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = hex(await crypto.subtle.sign("HMAC", key, enc.encode(canonical)));
  const h: Record<string, string> = {
    "x-judge-timestamp": ts,
    "x-judge-nonce": nonce,
    "x-judge-signature": `v1=${mac}`,
  };
  if (opts.keyId) h["x-judge-key-id"] = opts.keyId;
  return h;
}

export interface JudgeCallResult<T = unknown> {
  status: number;
  retryAfterSec?: number;
  body: T;
}

export async function callJudge<T = unknown>(
  env: JudgeEnv,
  payload: unknown,
  opts: { path?: string; method?: "POST" | "GET"; timeoutMs?: number } = {},
): Promise<JudgeCallResult<T>> {
  const method = opts.method ?? "POST";
  const path = opts.path ?? "/judge";
  const body = method === "GET" ? "" : JSON.stringify(payload);
  const headers = await signJudgeRequest({ secret: env.JUDGE_HMAC_SECRET, keyId: env.JUDGE_KEY_ID, method, path, body });
  if (method !== "GET") headers["content-type"] = "application/json";
  const res = await fetch(env.JUDGE_URL.replace(/\/+$/, "") + path, {
    method,
    headers,
    body: method === "GET" ? undefined : body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  const retry = res.headers.get("retry-after");
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep text
  }
  return { status: res.status, retryAfterSec: retry ? Number(retry) : undefined, body: parsed as T };
}
