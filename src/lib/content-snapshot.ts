import "server-only";
import { request } from "https";
import { gunzipSync } from "zlib";

/**
 * The course repo as one in-memory snapshot, so reading content costs one GitHub API call per
 * server instance instead of one per file.
 *
 * Why: every lesson page, the course map, the sitemap and search read many files; at one
 * /contents call each, a build plus a content refresh spent the token's 5,000 calls an hour and
 * production builds failed with "API rate limit exceeded".
 *
 * How: GET /repos/{owner}/{repo}/tarball/{ref} (a single API call; the redirect to codeload is
 * not an API call), gunzip, parse the tar, keep the files under resources/ in a Map. Freshness:
 * at most every CHECK_MS the branch head is asked for with If-None-Match; a 304 does not count
 * against GitHub's rate limit, a new head re-downloads the tarball. So a content push is picked up
 * within seconds by any instance that reads content.
 *
 * Callers fall back to the per-file API when this returns null (no token, network error, a parse
 * problem), so a snapshot failure can't take the site down.
 */

type Snapshot = { sha: string; files: Map<string, Buffer>; dirs: Map<string, Set<string>>; checkedAt: number; etag: string | null };

const CHECK_MS = 15_000;
let snap: Snapshot | null = null;
let loading: Promise<Snapshot | null> | null = null;
let failedAt = 0;

/** Parse a (gzipped) tar: path → contents for regular files. Handles pax and GNU long names. */
export function parseTar(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let off = 0;
  let longName: string | null = null;
  let paxPath: string | null = null;
  const str = (b: Buffer) => b.toString("utf8").replace(/\0[\s\S]*$/, "");
  while (off + 512 <= buf.length) {
    const h = buf.subarray(off, off + 512);
    if (h.every((x) => x === 0)) break;
    const name = str(h.subarray(0, 100));
    const size = parseInt(str(h.subarray(124, 136)).trim() || "0", 8);
    const type = String.fromCharCode(h[156] || 48);
    const prefix = str(h.subarray(345, 500));
    const body = buf.subarray(off + 512, off + 512 + size);
    off += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") {
      longName = str(body);
      continue;
    }
    if (type === "x") {
      // pax extended header for the next entry: "len key=value\n" records
      const m = body.toString("utf8").match(/\d+ path=([^\n]*)\n/);
      paxPath = m ? m[1] : null;
      continue;
    }
    if (type === "g") continue; // pax global header (git archive's commit comment)
    const full = paxPath ?? longName ?? (prefix ? `${prefix}/${name}` : name);
    paxPath = longName = null;
    if (type === "0" || type === "\0") out.set(full, Buffer.from(body));
  }
  return out;
}

/** files under resources/ keyed by repo path (the tarball's top folder stripped), plus directory listings */
export function indexTar(entries: Map<string, Buffer>): { files: Map<string, Buffer>; dirs: Map<string, Set<string>> } {
  const files = new Map<string, Buffer>();
  const dirs = new Map<string, Set<string>>();
  for (const [p, b] of entries) {
    const rel = p.replace(/^[^/]+\//, ""); // "owner-repo-sha/resources/…" → "resources/…"
    if (!rel.startsWith("resources/")) continue;
    files.set(rel, b);
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i++) {
      const dir = parts.slice(0, i).join("/");
      if (!dirs.has(dir)) dirs.set(dir, new Set());
      dirs.get(dir)!.add(parts[i]);
    }
  }
  return { files, dirs };
}

/**
 * GET over node:https, not fetch: Next patches fetch, and an uncached fetch while a page renders
 * would turn that ISR page dynamic. Follows redirects (the tarball redirects to codeload, which
 * gets no Authorization header).
 */
function get(url: string, headers: Record<string, string>, hops = 3): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { "User-Agent": "himanshukukreja.in", ...headers }, timeout: 30_000 }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && status !== 304 && res.headers.location && hops > 0) {
        res.resume();
        const { Authorization: _a, ...rest } = headers;
        void _a;
        resolve(get(new URL(res.headers.location, url).toString(), rest, hops - 1));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function head(owner: string, repo: string, ref: string, token: string, etag: string | null): Promise<{ sha: string | null; etag: string | null; same: boolean }> {
  const res = await get(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(ref)}`, {
    Accept: "application/vnd.github.sha",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    ...(etag ? { "If-None-Match": etag } : {}),
  });
  if (res.status === 304) return { sha: null, etag, same: true };
  if (res.status !== 200) throw new Error(`head ${res.status}`);
  const tag = res.headers.etag;
  return { sha: res.body.toString("utf8").trim(), etag: typeof tag === "string" ? tag : null, same: false };
}

async function download(owner: string, repo: string, sha: string, token: string): Promise<Map<string, Buffer>> {
  const res = await get(`https://api.github.com/repos/${owner}/${repo}/tarball/${sha}`, { Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" });
  if (res.status !== 200) throw new Error(`tarball ${res.status}`);
  return parseTar(gunzipSync(res.body));
}

/** The current snapshot, refreshed when the branch moved; null when it can't be had (callers fall back). */
export async function contentSnapshot(owner: string, repo: string, ref: string): Promise<Snapshot | null> {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token || process.env.SDM_SNAPSHOT === "off") return null;
  if (snap && Date.now() - snap.checkedAt < CHECK_MS) return snap;
  if (!snap && Date.now() - failedAt < 60_000) return null; // don't hammer after a failure
  if (loading) return loading;
  loading = (async () => {
    try {
      const h = await head(owner, repo, ref, token, snap?.etag ?? null);
      if (snap && (h.same || h.sha === snap.sha)) {
        snap.checkedAt = Date.now();
        if (h.etag) snap.etag = h.etag;
        return snap;
      }
      const sha = h.sha!;
      const { files, dirs } = indexTar(await download(owner, repo, sha, token));
      if (!files.size) throw new Error("empty snapshot");
      snap = { sha, files, dirs, checkedAt: Date.now(), etag: h.etag };
      return snap;
    } catch (e) {
      failedAt = Date.now();
      console.warn("[content-snapshot] falling back to per-file API:", (e as Error).message);
      return snap; // a stale snapshot beats none; null if there never was one
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Drop this instance's snapshot (POST /api/revalidate-courses): the next read re-checks at once. */
export function invalidateContentSnapshot() {
  if (snap) snap.checkedAt = 0;
}

