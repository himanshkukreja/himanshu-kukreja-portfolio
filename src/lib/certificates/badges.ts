import "server-only";
/**
 * Open Badges for certificates, in both versions wallets import:
 *
 *   Open Badges 3.0  an OpenBadgeCredential (a W3C verifiable credential) signed as a JWT with RS256,
 *                    the one algorithm the spec requires every implementation to support. The learner
 *                    downloads it from their certificate (public page or not). The public key is at
 *                    /.well-known/jwks.json and in the JWT header (`jwk`).
 *   Open Badges 2.0  a hosted assertion at /cert/<code>/badge.json (public certificates only), with its
 *                    BadgeClass and Issuer under /api/badges/*: what Badgr / Canvas Credentials import
 *                    from a URL. The recipient is the learner's email, salted and hashed.
 *
 * Key: CERT_BADGE_KEY = base64 of an RSA private key (PKCS#8 PEM, 2048-bit). Without it the badge
 * endpoints answer 503 and the buttons stay hidden; certificates themselves don't depend on it.
 */
import crypto from "node:crypto";
import { CERT_ORIGIN, CERT_TITLE, DISCLAIMER, ISSUER, MOCKS_NEEDED, TRIAL_PASS_PCT, certTitle, certUrl, type CertificateView } from "./core";

const ORIGIN = CERT_ORIGIN;
export const ISSUER_URL = `${ORIGIN}/api/badges/issuer`;
export const JWKS_URL = `${ORIGIN}/.well-known/jwks.json`;
export const badgeKind = (c: Pick<CertificateView, "kind" | "world">) => (c.kind === "course" ? "course" : `world-${c.world?.code ?? "00"}`);
export const badgeClassUrl = (kind: string) => `${ORIGIN}/api/badges/class/${kind}`;
export const badgeImageUrl = (kind: string) => `${ORIGIN}/api/badges/image/${kind}`;
export const assertionUrl = (code: string) => `${ORIGIN}/cert/${code}/badge.json`;

/* ------------------------------------------------------------------ key */

type Key = { priv: crypto.KeyObject; jwk: crypto.JsonWebKey & { kid: string; alg: string; use: string } };
let cached: Key | null | undefined;

export function badgeKey(): Key | null {
  if (cached !== undefined) return cached;
  const raw = process.env.CERT_BADGE_KEY;
  if (!raw) return (cached = null);
  try {
    const pem = raw.includes("BEGIN") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const priv = crypto.createPrivateKey(pem);
    const pub = crypto.createPublicKey(priv).export({ format: "jwk" });
    // kid: the RFC 7638 thumbprint, so it changes only with the key
    const thumb = crypto.createHash("sha256").update(JSON.stringify({ e: pub.e, kty: pub.kty, n: pub.n })).digest("base64url");
    cached = { priv, jwk: { ...pub, kid: thumb, alg: "RS256", use: "sig" } };
  } catch (e) {
    console.error("[badges] CERT_BADGE_KEY unreadable", e instanceof Error ? e.message : e);
    cached = null;
  }
  return cached;
}

export const jwks = () => {
  const k = badgeKey();
  return { keys: k ? [k.jwk] : [] };
};

/** Per-certificate salt for the hashed email (stable, not guessable without the key). */
function salt(code: string): string {
  const k = badgeKey();
  return crypto
    .createHmac("sha256", k ? k.priv.export({ format: "pem", type: "pkcs8" }).toString() : "no-key")
    .update(`badge-salt|${code}`)
    .digest("hex")
    .slice(0, 16);
}
const hashedEmail = (email: string, code: string) => {
  const s = salt(code);
  return { salt: s, hash: `sha256$${crypto.createHash("sha256").update(email.trim().toLowerCase() + s).digest("hex")}` };
};

/* ------------------------------------------------------------------ what the badge says */

function about(kind: string, worldTitle?: string | null) {
  if (kind === "course") {
    return {
      name: certTitle("course"),
      description: `${CERT_TITLE} for ${ISSUER}, an online course on designing systems at scale. ${DISCLAIMER}`,
      criteria: `Every core lesson and every capstone interview completed; every trial part passed at ${TRIAL_PASS_PCT}% or more (answers re-checked on the server); every interview boss beaten; ${MOCKS_NEEDED} different timed mock interviews self-scored against a levelled rubric at Hire or better.`,
    };
  }
  const code = kind.replace("world-", "");
  return {
    name: certTitle("world", { code, title: worldTitle || `World ${code}` }),
    description: `${CERT_TITLE} for World ${code}${worldTitle ? ` (${worldTitle})` : ""} of ${ISSUER}. ${DISCLAIMER}`,
    criteria: `Every lesson of World ${code} completed, every trial part of the world passed at ${TRIAL_PASS_PCT}% or more (answers re-checked on the server) and its interview boss beaten, where it has one.`,
  };
}

/* ------------------------------------------------------------------ Open Badges 2.0 (hosted) */

export const ob2Issuer = () => ({
  "@context": "https://w3id.org/openbadges/v2",
  type: "Issuer",
  id: ISSUER_URL,
  name: ISSUER,
  url: `${ORIGIN}/learn`,
  description: `${ISSUER}: a free online course on designing systems at scale, by Himanshu Kukreja.`,
  image: badgeImageUrl("course"),
});

export function ob2BadgeClass(kind: string, worldTitle?: string | null) {
  const a = about(kind, worldTitle);
  return {
    "@context": "https://w3id.org/openbadges/v2",
    type: "BadgeClass",
    id: badgeClassUrl(kind),
    name: a.name,
    description: a.description,
    image: badgeImageUrl(kind),
    criteria: { id: `${ORIGIN}/learn/certificate`, narrative: a.criteria },
    issuer: ISSUER_URL,
  };
}

export function ob2Assertion(c: CertificateView, email: string) {
  const kind = badgeKind(c);
  const id = hashedEmail(email, c.code);
  return {
    "@context": "https://w3id.org/openbadges/v2",
    type: "Assertion",
    id: assertionUrl(c.code),
    recipient: { type: "email", hashed: true, salt: id.salt, identity: id.hash },
    badge: badgeClassUrl(kind),
    verification: { type: "hosted" },
    issuedOn: c.issuedAt,
    evidence: [{ id: certUrl(c.code), narrative: `Certificate ${c.code}: ${certUrl(c.code)}` }],
    ...(c.status === "revoked" ? { revoked: true, revocationReason: "Revoked by the issuer." } : {}),
  };
}

/* ------------------------------------------------------------------ Open Badges 3.0 (signed JWT) */

export function ob3Credential(c: CertificateView, email: string | null) {
  const kind = badgeKind(c);
  const a = about(kind, c.world?.title);
  const ids: Record<string, unknown>[] = [{ type: "IdentityObject", identityType: "name", hashed: false, identityHash: c.name }];
  if (email) {
    const h = hashedEmail(email, c.code);
    ids.push({ type: "IdentityObject", identityType: "emailAddress", hashed: true, identityHash: h.hash, salt: h.salt });
  }
  return {
    "@context": ["https://www.w3.org/ns/credentials/v2", "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"],
    id: `${certUrl(c.code)}#ob3`,
    type: ["VerifiableCredential", "OpenBadgeCredential"],
    issuer: { id: ISSUER_URL, type: ["Profile"], name: ISSUER, url: `${ORIGIN}/learn` },
    validFrom: c.issuedAt,
    name: a.name,
    credentialSubject: {
      type: ["AchievementSubject"],
      identifier: ids,
      achievement: {
        id: badgeClassUrl(kind),
        type: ["Achievement"],
        achievementType: "Certificate",
        name: a.name,
        description: a.description,
        criteria: { id: `${ORIGIN}/learn/certificate`, narrative: a.criteria },
        image: { id: badgeImageUrl(kind), type: "Image" },
        creator: { id: ISSUER_URL, type: ["Profile"], name: ISSUER },
      },
    },
    evidence: [{ id: certUrl(c.code), type: ["Evidence"], name: `Certificate ${c.code}`, description: "The certificate's verification page: its status, the name and how it was earned." }],
  };
}

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

/** The credential as a compact JWS (RS256): header carries the public key, payload is the credential + JWT claims. */
export function signOb3(credential: ReturnType<typeof ob3Credential>): string {
  const k = badgeKey();
  if (!k) throw new Error("CERT_BADGE_KEY is not set");
  const { kid, ...pub } = k.jwk;
  const header = { alg: "RS256", typ: "JWT", kid: `${JWKS_URL}#${kid}`, jwk: { kty: pub.kty, n: pub.n, e: pub.e } };
  const payload = { ...credential, iss: credential.issuer.id, jti: credential.id, nbf: Math.floor(Date.parse(credential.validFrom) / 1000) };
  const input = `${b64u(header)}.${b64u(payload)}`;
  const sig = crypto.sign("RSA-SHA256", Buffer.from(input), k.priv).toString("base64url");
  return `${input}.${sig}`;
}

/** Check a badge JWT against our key (tests, and anyone curious). */
export function verifyOb3(jwt: string): boolean {
  const k = badgeKey();
  if (!k) return false;
  const [h, p, s] = jwt.split(".");
  if (!h || !p || !s) return false;
  return crypto.verify("RSA-SHA256", Buffer.from(`${h}.${p}`), crypto.createPublicKey(k.priv), Buffer.from(s, "base64url"));
}
