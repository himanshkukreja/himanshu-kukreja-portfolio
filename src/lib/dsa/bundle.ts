import { createHash } from "crypto";

/**
 * The DSA content bundle (pure: no server-only imports, so scripts/tests can load it). One R2 object per content
 * commit, written by the dsa-mastery repo's sync-r2 workflow (.github/scripts/r2-bundle.mjs) to
 * dsa/<branch>/bundles/<sha>.json and named in that commit's manifest.json:
 *   manifest  { sha, dirs, bundle: { key: "bundles/<sha>.json", sha, bytes, sha256 } }
 *   bundle    { format: "dsa-content-bundle", v: 1, sha, files: { path: text }, missing: [path], heads: { path: text } }
 * `files` are exact copies of the files every index-level loader reads (concepts, modules, cast, product lines,
 * worlds, the plan, the labs' lab.yml), `missing` the fixed paths that don't exist at that commit, and `heads` the top
 * of each problem.md (front matter and statement, up to ## Examples / Constraints / Hints): all the problem index uses.
 *
 * Why: a cold DSA page read ~2,000 files from R2 to rebuild those indexes (68 s on Workers, Nov 2026). With the bundle
 * it reads one ~1 MB object, once per Worker isolate and content commit (src/lib/dsa/content.ts dsaBundle), plus the
 * files of the page itself. Raw text, not parsed data: the site parses it exactly as it parses the files, so the
 * bundle can't disagree with them, and it's keyed by the content commit, so a code deploy doesn't make it stale.
 * Anything that doesn't check out (size, hash, format, commit) → null, and the loaders read the files one by one.
 */

export const BUNDLE_FORMAT = "dsa-content-bundle";
export const BUNDLE_VERSION = 1;
/** Bigger bundles are refused (the content repo stops writing them at 8 MiB): ~1 MB at 229 problems, Nov 2026. */
export const MAX_BUNDLE_BYTES = 12 * 1024 * 1024;

export type BundleRef = { key: string; sha: string; bytes: number; sha256: string };
export type DsaBundle = { sha: string; files: Map<string, string>; missing: Set<string>; heads: Map<string, string> };

const SHA = /^[0-9a-f]{40}$/;
const PATH = /^(?:resources|generated)\/[A-Za-z0-9._/-]+$/;
const HEAD_PATH = /^resources\/problems\/[a-z0-9]+(?:-[a-z0-9]+)*\/problem\.md$/;

/** The bundle a manifest names, or null when it names none or the entry doesn't describe this commit's bundle. */
export function bundleRefOf(manifest: { sha?: unknown; bundle?: unknown } | null | undefined): BundleRef | null {
  const b = manifest?.bundle as Partial<BundleRef> | null | undefined;
  if (!b || typeof b !== "object" || typeof manifest?.sha !== "string") return null;
  const { key, sha, bytes, sha256 } = b;
  if (typeof sha !== "string" || !SHA.test(sha) || sha !== manifest.sha) return null;
  if (key !== `bundles/${sha}.json`) return null;
  if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_BUNDLE_BYTES) return null;
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  return { key, sha, bytes, sha256 };
}

const stringMap = (o: unknown, path: RegExp): Map<string, string> | null => {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    if (typeof v !== "string" || !path.test(k) || k.includes("..")) return null;
    m.set(k, v);
  }
  return m;
};

/** The bundle's text checked against the manifest entry (length, SHA-256, format, commit); null when anything is off. */
export function parseBundle(body: string | Uint8Array, ref: BundleRef): DsaBundle | null {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  if (buf.length !== ref.bytes || buf.length > MAX_BUNDLE_BYTES) return null;
  if (createHash("sha256").update(buf).digest("hex") !== ref.sha256) return null;
  let j: { format?: unknown; v?: unknown; sha?: unknown; files?: unknown; missing?: unknown; heads?: unknown };
  try {
    j = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  if (!j || j.format !== BUNDLE_FORMAT || j.v !== BUNDLE_VERSION || j.sha !== ref.sha) return null;
  const files = stringMap(j.files, PATH);
  const heads = stringMap(j.heads ?? {}, HEAD_PATH);
  const missing = Array.isArray(j.missing) && j.missing.every((p) => typeof p === "string" && PATH.test(p)) ? new Set(j.missing as string[]) : null;
  if (!files || !heads || !missing) return null;
  return { sha: ref.sha, files, missing, heads };
}

/**
 * The bundle of the current manifest, read once per commit: `manifest()` gives the manifest's { sha, bundle } (or null),
 * `read(key)` the object's bytes (null: no such object, undefined: unreadable). Resolves to null whenever the bundle
 * can't be used, so callers read the files one by one; a failed bundle is tried again after `retryMs`, and a new
 * commit's manifest names a new bundle, so an old commit's bundle is never served.
 */
export function bundleLoader(deps: {
  manifest: () => Promise<{ sha?: unknown; bundle?: unknown } | null>;
  read: (key: string) => Promise<Uint8Array | string | null | undefined>;
  now?: () => number;
  retryMs?: number;
  warn?: (msg: string) => void;
}): () => Promise<DsaBundle | null> {
  const now = deps.now || Date.now;
  const retryMs = deps.retryMs ?? 60_000;
  let slot: { sha: string; bundle: Promise<DsaBundle | null>; failedAt: number | null } | null = null;
  return async () => {
    const ref = bundleRefOf(await deps.manifest().catch(() => null));
    if (!ref) return null;
    const cur = slot;
    if (cur && cur.sha === ref.sha && !(cur.failedAt !== null && now() - cur.failedAt > retryMs)) return cur.bundle;
    const next: NonNullable<typeof slot> = { sha: ref.sha, failedAt: null, bundle: Promise.resolve(null) };
    next.bundle = (async () => {
      const t0 = now();
      const body = await deps.read(ref.key);
      const b = body ? parseBundle(body, ref) : null;
      if (!b) {
        next.failedAt = now();
        deps.warn?.(`${ref.key} ${body === null ? "missing" : body === undefined ? "unreadable" : "failed its checks"}: reading files one by one`);
      } else if (now() - t0 > 1000) deps.warn?.(`${ref.key} took ${now() - t0} ms`);
      return b;
    })().catch(() => {
      next.failedAt = now();
      return null;
    });
    slot = next;
    return next.bundle;
  };
}

/** A file's text from the bundle: the text, null when the bundle knows it doesn't exist, undefined when it isn't in it. */
export function bundleText(b: DsaBundle | null | undefined, path: string): string | null | undefined {
  if (!b) return undefined;
  const t = b.files.get(path);
  if (t !== undefined) return t;
  return b.missing.has(path) ? null : undefined;
}

/**
 * A problem.md up to its first `## Examples`, `## Constraints` or `## Hints` heading after the front matter: its front
 * matter and the statement's first words, all the problem index reads (problemSummary below). The content repo's
 * r2-bundle.mjs cuts heads with these same expressions.
 */
export function problemHead(md: string): string {
  const front = md.match(/^---[\s\S]*?\n---\s*/);
  const start = front ? front[0].length : 0;
  const cut = md.slice(start).search(/^## (?:Examples?|Constraints|Hints?)\b/m);
  return cut < 0 ? md : md.slice(0, start + cut);
}

/** The statement's first words as plain text (Scenario, then the task), for the problems search box. Same on a head. */
export function blurbOf(md: string, max = 220): string {
  const body = md.replace(/^---[\s\S]*?\n---\s*/, "").split(/^## (?:Examples?|Constraints|Hints?)\b/m)[0];
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/^#+\s.*$/gm, " ")
    .replace(/[`*_>#[\]()|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, "") : text;
}

/**
 * Per-isolate results keyed by content commit: an index computed from bundle `sha` is kept until the content changes,
 * then every entry goes at once. A failed computation isn't kept. Promises, so concurrent callers share one run.
 */
export function versionedMemo() {
  let version = "";
  const items = new Map<string, Promise<unknown>>();
  return {
    get<R>(v: string, key: string, run: () => Promise<R>): Promise<R> {
      if (v !== version) {
        version = v;
        items.clear();
      }
      let p = items.get(key) as Promise<R> | undefined;
      if (!p) {
        const made = run();
        p = made;
        items.set(key, made);
        made.catch(() => {
          if (items.get(key) === made) items.delete(key);
        });
      }
      return p;
    },
    get size() {
      return items.size;
    },
  };
}
