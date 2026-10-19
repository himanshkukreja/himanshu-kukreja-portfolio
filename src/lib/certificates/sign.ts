/**
 * Certificate signatures: HMAC-SHA256 over `code|user_id|kind|world_key|display_name|issued_at`
 * (issued_at as an ISO-8601 UTC string with milliseconds, world_key "" for the course certificate).
 *
 * Key: HKDF-SHA256(ikm, salt = "", info = "sdm-certificate-signing-v1", 32 bytes) where ikm is
 *   - CERT_SIGNING_SECRET when it is set (recommended; signatures look like `v1.s.<hex>`), else
 *   - SUPABASE_SERVICE_ROLE_KEY (signatures look like `v1.k.<hex>`).
 * The marker in the signature says which key made it, so adding CERT_SIGNING_SECRET later keeps
 * older certificates verifiable as long as the service-role key is unchanged; rotating the
 * service-role key without CERT_SIGNING_SECRET would make `v1.k` signatures fail their check.
 *
 * Server only. Self-contained (node:crypto only) so the Node tests can import it directly.
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export type SignedFields = {
  code: string;
  userId: string;
  kind: "course" | "world";
  worldKey: string | null;
  displayName: string;
  issuedAt: string;
};

const INFO = "sdm-certificate-signing-v1";

/** Dev-only fallback so fixtures sign without secrets (never used when NODE_ENV is production). */
const DEV_IKM = "sdm-certificates-dev-only-not-a-secret";

type Source = "s" | "k";

function ikmFor(source: Source, env: Record<string, string | undefined>): string | null {
  if (source === "s") {
    const s = env.CERT_SIGNING_SECRET?.trim();
    return s && s.length >= 16 ? s : null;
  }
  const k = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (k) return k;
  return env.NODE_ENV !== "production" && env.CERT_FIXTURES === "1" ? DEV_IKM : null;
}

function keyFor(source: Source, env: Record<string, string | undefined>): Buffer | null {
  const ikm = ikmFor(source, env);
  if (!ikm) return null;
  return Buffer.from(hkdfSync("sha256", Buffer.from(ikm, "utf8"), Buffer.alloc(0), Buffer.from(INFO, "utf8"), 32));
}

/** Which key new certificates are signed with (null: signing isn't configured). */
export function signingSource(env: Record<string, string | undefined> = process.env): Source | null {
  if (ikmFor("s", env)) return "s";
  if (ikmFor("k", env)) return "k";
  return null;
}

/** The exact bytes that are signed. */
export function signingPayload(f: SignedFields): string {
  const issued = new Date(f.issuedAt);
  if (Number.isNaN(issued.getTime())) throw new Error("invalid issued_at");
  return [f.code, f.userId, f.kind, f.worldKey ?? "", f.displayName, issued.toISOString()].join("|");
}

export function signCertificate(f: SignedFields, env: Record<string, string | undefined> = process.env): string {
  const source = signingSource(env);
  const key = source ? keyFor(source, env) : null;
  if (!source || !key) throw new Error("certificate signing is not configured (CERT_SIGNING_SECRET or SUPABASE_SERVICE_ROLE_KEY)");
  return `v1.${source}.${createHmac("sha256", key).update(signingPayload(f), "utf8").digest("hex")}`;
}

/** "ok" | "bad" (tampered or wrong key) | "unchecked" (the key that signed it isn't available here). */
export function verifySignature(f: SignedFields, signature: string, env: Record<string, string | undefined> = process.env): "ok" | "bad" | "unchecked" {
  const m = /^v1\.([sk])\.([0-9a-f]{64})$/.exec(signature || "");
  if (!m) return "bad";
  const key = keyFor(m[1] as Source, env);
  if (!key) return "unchecked";
  let expected: Buffer;
  try {
    expected = createHmac("sha256", key).update(signingPayload(f), "utf8").digest();
  } catch {
    return "bad";
  }
  const got = Buffer.from(m[2], "hex");
  return got.length === expected.length && timingSafeEqual(got, expected) ? "ok" : "bad";
}
