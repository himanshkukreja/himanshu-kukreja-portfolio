import "server-only";
import { createHash, createHmac } from "crypto";
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
 */

type Manifest = { sha: string; dirs: Map<string, string[]>; checkedAt: number; etag: string | null };

const CHECK_MS = 60_000;
let manifest: Manifest | null = null;
let loading: Promise<Manifest | null> | null = null;
let failedAt = 0;

const cfg = () => {
  const e = process.env;
  if (!e.SDM_R2_ACCOUNT_ID || !e.SDM_R2_BUCKET || !e.SDM_R2_ACCESS_KEY_ID || !e.SDM_R2_SECRET_ACCESS_KEY) return null;
  return { host: `${e.SDM_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, bucket: e.SDM_R2_BUCKET, key: e.SDM_R2_ACCESS_KEY_ID, secret: e.SDM_R2_SECRET_ACCESS_KEY };
};

export const r2ContentConfigured = () => cfg() !== null && process.env.SDM_R2 !== "off";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();
const enc = (p: string) => p.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");

/** A signed S3 GET (SigV4, region "auto"). 404 → null. */
function get(key: string, extra: Record<string, string> = {}): Promise<{ status: number; etag: string | null; body: Buffer } | null> {
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
    const req = request({ host: c.host, path, method: "GET", headers: { ...headers, ...extra, authorization: auth }, timeout: 15_000 }, (res) => {
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

/** The branch's manifest, re-checked at most every CHECK_MS (a 304 when unchanged); null = unavailable. */
async function loadManifest(branch: string): Promise<Manifest | null> {
  if (manifest && Date.now() - manifest.checkedAt < CHECK_MS) return manifest;
  if (!manifest && Date.now() - failedAt < 60_000) return null;
  if (loading) return loading;
  loading = (async () => {
    try {
      const res = await get(`${branch}/manifest.json`, manifest?.etag ? { "if-none-match": manifest.etag } : {});
      if (!res) throw new Error("no manifest");
      if (res.status === 304 && manifest) {
        manifest.checkedAt = Date.now();
        return manifest;
      }
      const j = JSON.parse(res.body.toString("utf8")) as { sha: string; dirs: Record<string, string[]> };
      manifest = { sha: j.sha, dirs: new Map(Object.entries(j.dirs)), checkedAt: Date.now(), etag: res.etag };
      return manifest;
    } catch (e) {
      failedAt = Date.now();
      console.warn("[content-r2] unavailable, falling back:", (e as Error).message);
      return manifest; // a stale manifest beats none
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Directory entries ("name" for files, "name/" for folders), or a file marker; null = not served from R2. */
export async function r2List(branch: string, path: string): Promise<{ kind: "dir"; entries: string[] } | { kind: "file" } | { kind: "missing" } | null> {
  const m = await loadManifest(branch);
  if (!m) return null;
  const clean = path.replace(/^\/+|\/+$/g, "");
  const entries = m.dirs.get(clean);
  if (entries) return { kind: "dir", entries };
  const parent = clean.includes("/") ? clean.slice(0, clean.lastIndexOf("/")) : "";
  const name = clean.slice(clean.lastIndexOf("/") + 1);
  return m.dirs.get(parent)?.includes(name) ? { kind: "file" } : { kind: "missing" };
}

/** A file's text; undefined = not served from R2 (fall back), null = the file doesn't exist. */
export async function r2Read(branch: string, path: string): Promise<string | null | undefined> {
  if (!(await loadManifest(branch))) return undefined;
  try {
    const res = await get(`${branch}/files/${path.replace(/^\/+/, "")}`);
    return res ? res.body.toString("utf8") : null;
  } catch (e) {
    console.warn("[content-r2] read failed, falling back:", (e as Error).message);
    return undefined;
  }
}

/** POST /api/revalidate-courses: the next read re-checks the manifest at once. */
export function invalidateR2Manifest() {
  if (manifest) manifest.checkedAt = 0;
}
