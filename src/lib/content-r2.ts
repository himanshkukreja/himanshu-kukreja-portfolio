import "server-only";
import { createHash, createHmac } from "crypto";
import { request as httpRequest } from "http";
import { request } from "https";

/**
 * Course content from Cloudflare R2: the content repo's resources/ folder, synced on every push by
 * the content repo's GitHub Action (.github/workflows/sync-r2.yml) to
 *   <bucket>/<branch>/files/resources/...   one object per file
 *   <bucket>/<branch>/manifest.json         { sha, dirs: { "resources/x": ["a.md", "b/"] } }
 *
 * Why: one small read per file instead of GitHub's API (no 5,000/h limit, no token on the server) and
 * no whole-repo snapshot in memory (Workers allow 128 MB per isolate; the repo is ~35 MB).
 * Works on any host: S3 API + SigV4 over node:https. Not fetch: Next patches fetch, and an uncached
 * fetch while a page renders would turn that ISR page dynamic (same reason as content-snapshot.ts).
 *
 * Configured by SDM_R2_ACCOUNT_ID, SDM_R2_BUCKET, SDM_R2_ACCESS_KEY_ID, SDM_R2_SECRET_ACCESS_KEY
 * (a read-only R2 token is enough). Unset → callers fall back to the snapshot / GitHub API.
 * SDM_R2_ENDPOINT (e.g. http://127.0.0.1:9100) overrides the R2 host, for local tests against a stand-in.
 * On Cloudflare the Worker's R2 binding SDM_CONTENT (wrangler.jsonc) is used instead: same bucket, no
 * signing, no public network hop.
 *
 * Source-aware (DSA Mastery plan §14.2): the same bucket also holds the dsa-mastery repo under a `dsa/` prefix,
 *   <bucket>/dsa/<branch>/files/{resources,generated}/...   and   <bucket>/dsa/<branch>/manifest.json
 * read with readContent("dsa", path) / listContent("dsa", path). The System Design Mastery keys are unchanged
 * (r2Read / r2List with the bare branch), and each prefix keeps its own manifest cache.
 */

type Manifest = { sha: string; dirs: Map<string, string[]>; checkedAt: number; etag: string | null };
type ManifestSlot = { manifest: Manifest | null; loading: Promise<Manifest | null> | null; failedAt: number };

const CHECK_MS = 60_000;
/** One slot per key prefix: "<branch>" for System Design Mastery, "dsa/<branch>" for DSA Mastery. */
const slots = new Map<string, ManifestSlot>();
const slotOf = (prefix: string): ManifestSlot => {
  let s = slots.get(prefix);
  if (!s) slots.set(prefix, (s = { manifest: null, loading: null, failedAt: 0 }));
  return s;
};

/** Which repo a read is for: the course repo (system-design-mastery) or the DSA content repo (dsa-mastery). */
export type ContentSource = "sdm" | "dsa";

/** The object-key prefix of a source's branch: SDM keys start at the branch, DSA keys under dsa/. */
export const contentPrefix = (source: ContentSource, branch: string) => (source === "dsa" ? `dsa/${branch}` : branch);

const defaultBranch = (source: ContentSource) => (source === "dsa" ? process.env.DSA_BRANCH || "main" : process.env.SDM_BRANCH || "main");

const cfg = () => {
  const e = process.env;
  if (!e.SDM_R2_ACCOUNT_ID || !e.SDM_R2_BUCKET || !e.SDM_R2_ACCESS_KEY_ID || !e.SDM_R2_SECRET_ACCESS_KEY) return null;
  const endpoint = new URL(e.SDM_R2_ENDPOINT || `https://${e.SDM_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
  return { host: endpoint.host, hostname: endpoint.hostname, port: endpoint.port, secure: endpoint.protocol === "https:", bucket: e.SDM_R2_BUCKET, key: e.SDM_R2_ACCESS_KEY_ID, secret: e.SDM_R2_SECRET_ACCESS_KEY };
};

type R2ObjectLike = { httpEtag: string; arrayBuffer?: () => Promise<ArrayBuffer> };
type R2BucketLike = { get(key: string, opts?: { onlyIf?: { etagDoesNotMatch: string } }): Promise<R2ObjectLike | null> };

/** The Worker's R2 binding, when running on Cloudflare (OpenNext keeps the request's env on this symbol). */
function binding(): R2BucketLike | null {
  const ctx = (globalThis as Record<symbol, { env?: Record<string, unknown> } | undefined>)[Symbol.for("__cloudflare-context__")];
  const b = ctx?.env?.SDM_CONTENT as R2BucketLike | undefined;
  return b && typeof b.get === "function" ? b : null;
}

export const r2ContentConfigured = () => (binding() !== null || cfg() !== null) && process.env.SDM_R2 !== "off";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();
const enc = (p: string) => p.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");

/**
 * At most 6 R2 requests in flight per instance: Workers allow 6 open connections per request and queue
 * the rest, so a page that reads 200+ files at once (the lecture list) would otherwise time out while
 * queued. The timeout below only covers a request that is actually running.
 */
const MAX_IN_FLIGHT = 6;
let inFlight = 0;
const waiting: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((r) => waiting.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiting.shift()?.();
  }
}

/** A signed S3 GET (SigV4, region "auto"). 404 → null. */
function get(key: string, extra: Record<string, string> = {}): Promise<{ status: number; etag: string | null; body: Buffer } | null> {
  const b = binding();
  if (b) return getBound(b, key, extra["if-none-match"]);
  return limited(() => getNow(key, extra));
}

/** Read through the R2 binding (Cloudflare): a 304-like result when the etag still matches. */
async function getBound(b: R2BucketLike, key: string, ifNoneMatch?: string): Promise<{ status: number; etag: string | null; body: Buffer } | null> {
  const o = await b.get(key, ifNoneMatch ? { onlyIf: { etagDoesNotMatch: ifNoneMatch.replace(/^W\//, "").replace(/"/g, "") } } : undefined);
  if (!o) return null;
  if (typeof o.arrayBuffer !== "function") return { status: 304, etag: o.httpEtag, body: Buffer.alloc(0) };
  return { status: 200, etag: o.httpEtag, body: Buffer.from(await o.arrayBuffer()) };
}

function getNow(key: string, extra: Record<string, string> = {}): Promise<{ status: number; etag: string | null; body: Buffer } | null> {
  const c = cfg()!;
  const path = `/${c.bucket}/${enc(key)}`;
  const now = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = now.slice(0, 8);
  const payload = sha256("");
  const headers: Record<string, string> = { host: c.host, "x-amz-content-sha256": payload, "x-amz-date": now };
  const names = Object.keys(headers).sort();
  const canonical = ["GET", path, "", ...names.map((n) => `${n}:${headers[n]}`), "", names.join(";"), payload].join("\n");
  const scope = `${day}/auto/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", now, scope, sha256(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${c.secret}`, day), "auto"), "s3"), "aws4_request");
  const sig = createHmac("sha256", kSigning).update(toSign).digest("hex");
  const auth = `AWS4-HMAC-SHA256 Credential=${c.key}/${scope}, SignedHeaders=${names.join(";")}, Signature=${sig}`;
  return new Promise((resolve, reject) => {
    const req = (c.secure ? request : httpRequest)({ hostname: c.hostname, port: c.port || undefined, path, method: "GET", headers: { ...headers, ...extra, authorization: auth }, timeout: 15_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (d: Buffer) => chunks.push(d));
      res.on("end", () => {
        const status = res.statusCode || 0;
        const etag = typeof res.headers.etag === "string" ? res.headers.etag : null;
        if (status === 404) return resolve(null);
        if (status !== 200 && status !== 304) return reject(Object.assign(new Error(`R2 ${status} for ${key}`), { status }));
        resolve({ status, etag, body: Buffer.concat(chunks) });
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("R2 timeout")));
    req.on("error", reject);
    req.end();
  });
}

/** The prefix's manifest, re-checked at most every CHECK_MS (a 304 when unchanged); null = unavailable. */
async function loadManifest(prefix: string): Promise<Manifest | null> {
  const slot = slotOf(prefix);
  if (slot.manifest && Date.now() - slot.manifest.checkedAt < CHECK_MS) return slot.manifest;
  if (!slot.manifest && Date.now() - slot.failedAt < 60_000) return null;
  if (slot.loading) return slot.loading;
  slot.loading = (async () => {
    try {
      const res = await get(`${prefix}/manifest.json`, slot.manifest?.etag ? { "if-none-match": slot.manifest.etag } : {});
      if (!res) throw new Error("no manifest");
      if (res.status === 304 && slot.manifest) {
        slot.manifest.checkedAt = Date.now();
        return slot.manifest;
      }
      const j = JSON.parse(res.body.toString("utf8")) as { sha: string; dirs: Record<string, string[]> };
      slot.manifest = { sha: j.sha, dirs: new Map(Object.entries(j.dirs)), checkedAt: Date.now(), etag: res.etag };
      return slot.manifest;
    } catch (e) {
      slot.failedAt = Date.now();
      console.warn("[content-r2] unavailable, falling back:", (e as Error).message);
      return slot.manifest; // a stale manifest beats none
    } finally {
      slot.loading = null;
    }
  })();
  return slot.loading;
}

/** Directory entries ("name" for files, "name/" for folders), or a file marker; null = not served from R2. */
export async function r2List(branch: string, path: string): Promise<{ kind: "dir"; entries: string[] } | { kind: "file" } | { kind: "missing" } | null> {
  return listAt(branch, path);
}

/** A file's text; undefined = not served from R2 (fall back), null = the file doesn't exist. */
export async function r2Read(branch: string, path: string): Promise<string | null | undefined> {
  return readAt(branch, path);
}

async function listAt(prefix: string, path: string): Promise<{ kind: "dir"; entries: string[] } | { kind: "file" } | { kind: "missing" } | null> {
  const m = await loadManifest(prefix);
  if (!m) return null;
  const clean = path.replace(/^\/+|\/+$/g, "");
  const entries = m.dirs.get(clean);
  if (entries) return { kind: "dir", entries };
  const parent = clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : "";
  const name = clean.slice(clean.lastIndexOf("/") + 1);
  return m.dirs.get(parent)?.includes(name) ? { kind: "file" } : { kind: "missing" };
}

async function readAt(prefix: string, path: string): Promise<string | null | undefined> {
  if (!(await loadManifest(prefix))) return undefined;
  try {
    const res = await get(`${prefix}/files/${path.replace(/^\/+/, "")}`);
    return res ? res.body.toString("utf8") : null;
  } catch (e) {
    console.warn("[content-r2] read failed, falling back:", (e as Error).message);
    return undefined;
  }
}

/**
 * A source's file from R2 (path relative to the repo root, e.g. "resources/worlds/academy.yml").
 * undefined = R2 isn't configured or reachable (fall back), null = the file doesn't exist.
 */
export async function readContent(source: ContentSource, path: string, branch = defaultBranch(source)): Promise<string | null | undefined> {
  if (!r2ContentConfigured()) return undefined;
  return readAt(contentPrefix(source, branch), path);
}

/** A source's directory listing from R2 (see r2List); null = not served from R2. */
export async function listContent(source: ContentSource, path: string, branch = defaultBranch(source)) {
  if (!r2ContentConfigured()) return null;
  return listAt(contentPrefix(source, branch), path);
}

/** POST /api/revalidate-courses: the next read re-checks the manifests at once. */
export function invalidateR2Manifest() {
  for (const slot of slots.values()) if (slot.manifest) slot.manifest.checkedAt = 0;
}
