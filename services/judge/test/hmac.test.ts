import { test } from "node:test";
import assert from "node:assert/strict";
import { NonceCache, loadSecrets, sign, verifyRequest } from "../src/hmac.ts";
import { signJudgeRequest } from "../client/judge-client.ts";

const SECRET = "s".repeat(40);
const secrets = new Map([["default", SECRET], ["staging", "t".repeat(40)]]);
const NOW = 1_800_000_000_000;

function headers(over: Record<string, string> = {}, body = '{"a":1}', ts = String(NOW / 1000), nonce = "nonce_0123456789abcdef") {
  return {
    "x-judge-timestamp": ts,
    "x-judge-nonce": nonce,
    "x-judge-signature": sign(SECRET, ts, nonce, "POST", "/judge", body),
    ...over,
  };
}

const opts = () => ({ secrets, maxSkewSec: 60, nonces: new NonceCache(120_000), nowMs: NOW });

test("accepts a correctly signed request", () => {
  const r = verifyRequest(headers(), "POST", "/judge", Buffer.from('{"a":1}'), opts());
  assert.deepEqual(r, { ok: true, keyId: "default" });
});

test("rejects a tampered body", () => {
  const r = verifyRequest(headers(), "POST", "/judge", Buffer.from('{"a":2}'), opts());
  assert.equal(r.ok, false);
  assert.equal((r as { reason: string }).reason, "bad signature");
});

test("rejects a different path or method", () => {
  assert.equal(verifyRequest(headers(), "POST", "/health", Buffer.from('{"a":1}'), opts()).ok, false);
  assert.equal(verifyRequest(headers(), "GET", "/judge", Buffer.from('{"a":1}'), opts()).ok, false);
});

test("rejects the wrong secret", () => {
  const ts = String(NOW / 1000);
  const h = headers({ "x-judge-signature": sign("x".repeat(40), ts, "nonce_0123456789abcdef", "POST", "/judge", '{"a":1}') });
  assert.equal(verifyRequest(h, "POST", "/judge", Buffer.from('{"a":1}'), opts()).ok, false);
});

test("rejects timestamps outside the window, both directions", () => {
  for (const ts of [String(NOW / 1000 - 61), String(NOW / 1000 + 61)]) {
    const r = verifyRequest(headers({}, '{"a":1}', ts), "POST", "/judge", Buffer.from('{"a":1}'), opts());
    assert.deepEqual(r, { ok: false, reason: "timestamp outside window" });
  }
  const ok = verifyRequest(headers({}, '{"a":1}', String(NOW / 1000 - 59)), "POST", "/judge", Buffer.from('{"a":1}'), opts());
  assert.equal(ok.ok, true);
});

test("rejects a replayed nonce", () => {
  const o = opts();
  assert.equal(verifyRequest(headers(), "POST", "/judge", Buffer.from('{"a":1}'), o).ok, true);
  assert.deepEqual(verifyRequest(headers(), "POST", "/judge", Buffer.from('{"a":1}'), o), { ok: false, reason: "replayed nonce" });
});

test("rejects missing headers, bad nonce, unknown key id", () => {
  const body = Buffer.from('{"a":1}');
  assert.equal(verifyRequest({}, "POST", "/judge", body, opts()).ok, false);
  assert.equal(verifyRequest(headers({ "x-judge-nonce": "short" }), "POST", "/judge", body, opts()).ok, false);
  assert.deepEqual(verifyRequest(headers({ "x-judge-key-id": "nope" }), "POST", "/judge", body, opts()), { ok: false, reason: "unknown key id" });
});

test("separate keys per environment: a staging signature does not verify as prod", () => {
  const ts = String(NOW / 1000);
  const n = "nonce_staging_000000001";
  const h = { "x-judge-key-id": "staging", "x-judge-timestamp": ts, "x-judge-nonce": n, "x-judge-signature": sign("t".repeat(40), ts, n, "POST", "/judge", "{}") };
  assert.deepEqual(verifyRequest(h, "POST", "/judge", Buffer.from("{}"), opts()), { ok: true, keyId: "staging" });
  const asProd = { ...h, "x-judge-key-id": "default", "x-judge-nonce": "nonce_staging_000000002" };
  assert.equal(verifyRequest(asProd, "POST", "/judge", Buffer.from("{}"), opts()).ok, false);
});

test("the Worker client (Web Crypto) produces signatures the server accepts", async () => {
  const body = JSON.stringify({ language: "cpp", code: "int main(){}" });
  const h = await signJudgeRequest({ secret: SECRET, method: "POST", path: "/judge", body, nowSec: NOW / 1000 });
  const r = verifyRequest(h, "POST", "/judge", Buffer.from(body), opts());
  assert.deepEqual(r, { ok: true, keyId: "default" });
  const h2 = await signJudgeRequest({ secret: "t".repeat(40), keyId: "staging", method: "GET", path: "/health", body: "", nowSec: NOW / 1000 });
  assert.deepEqual(verifyRequest(h2, "GET", "/health", Buffer.alloc(0), opts()), { ok: true, keyId: "staging" });
});

test("loadSecrets: single, multiple, and too short", () => {
  const m = loadSecrets({ JUDGE_HMAC_SECRET: SECRET, JUDGE_HMAC_SECRETS: `prod:${"p".repeat(32)}, staging:${"q".repeat(32)}` });
  assert.deepEqual([...m.keys()].sort(), ["default", "prod", "staging"]);
  assert.throws(() => loadSecrets({ JUDGE_HMAC_SECRET: "short" }), /at least 32/);
  assert.throws(() => loadSecrets({ JUDGE_HMAC_SECRETS: "nocolon" }), /keyId:secret/);
});

test("NonceCache expires entries after the TTL", () => {
  const c = new NonceCache(1000);
  assert.equal(c.add("a", 0), true);
  assert.equal(c.add("a", 500), false);
  assert.equal(c.add("a", 1500), true);
});
