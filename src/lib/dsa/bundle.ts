import { createHash } from "crypto";

/**
 * The DSA content bundle (pure: no server-only imports, so scripts/tests can load it). One R2 object per content
 * commit, written by the dsa-mastery repo's sync-r2 workflow (.github/scripts/r2-bundle.mjs) to
 * dsa/<branch>/bundles/<sha>.json and named in that commit's manifest.json:
 *   manifest  { sha, dirs, bundle: { key: "bundles/<sha>.json", sha, bytes, sha256 } }
 *   bundle    { format: "dsa-content-bundle", v: 1, sha, files: { path: text }, missing: [path], heads: { path: text } }
 * `files` are exact copies of the files every index-level loader reads (concepts, modules, cast, product lines,
 * worlds, the plan, the labs' lab.yml, and generated/ traces and races), `missing` the fixed paths that don't exist at
 * that commit, and `heads` the top of each problem.md (front matter and statement, up to ## Examples / Constraints /
 * Hints): all the problem index uses. The page's own files come from its page bundle (below).
 *
 * Why: a cold DSA page read ~2,000 files from R2 to rebuild those indexes (68 s on Workers, Nov 2026). With the bundle
 * it reads one ~1.2 MB object, once per Worker isolate and content commit (src/lib/dsa/content.ts dsaBundle), plus the
 * page's bundle. Raw text, not parsed data: the site parses it exactly as it parses the files, so the
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

/* ------------------------------------------------------------------ page bundles */

/**
 * Page bundles: one object per lesson folder and per problem folder with the files its page reads (lesson, quiz, lab,
 * clips, lecture, shorts; statement, tests, solution video and solutions), written by the same sync-r2 run to
 * dsa/<branch>/pages/v1-<the folder's git tree id>.json and named in the manifest's bundle entry:
 *   manifest.bundle.pages  { "<folder>": { key: "pages/v1-<tree>.json", bytes, sha256 } }
 *   page bundle            { format: "dsa-page-bundle", v: 1, dir, files: { path: text }, skipped: [path] }
 * `files` and `skipped` together are every file in the folder at that commit (`skipped`: present, not carried; read
 * them one by one), so a path in neither doesn't exist. Why: R2 answers a read in 0.3-1 s from India (measured on
 * staging, Nov 2026, BOM colo) and a lesson page read ~13 files, 6 at a time; with its page bundle it reads one object,
 * at the same time as the content bundle (both are named in the manifest). Keyed by tree id, so a folder that didn't
 * change keeps its object from one commit to the next. Anything off → null, and the files are read one by one.
 */
export const PAGE_FORMAT = "dsa-page-bundle";
export const PAGE_VERSION = 1;
/** The content repo writes none over 2 MiB (~130 KB at most, Nov 2026). */
export const MAX_PAGE_BYTES = 4 * 1024 * 1024;

export type PageRef = { key: string; bytes: number; sha256: string };
export type PageBundle = { dir: string; files: Map<string, string>; skipped: Set<string> };

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*";
const PAGE_DIR = new RegExp(`^resources/(?:problems/${SLUG}|(?:modules|structures|algorithms)/${SLUG}/${SLUG})$`);
const PAGE_DIR_OF = new RegExp(`^(resources/(?:problems/${SLUG}|(?:modules|structures|algorithms)/${SLUG}/${SLUG}))/`);
const PAGE_KEY = /^pages\/v1-[0-9a-f]{40}\.json$/;

/** The page folder a path is in (a problem's or a lesson's), or null. */
export function pageDirOf(path: string): string | null {
  return path.match(PAGE_DIR_OF)?.[1] ?? null;
}

/** The page bundles a manifest's bundle entry names (only well-formed entries; none when there's no usable bundle). */
export function pageRefsOf(manifest: { sha?: unknown; bundle?: unknown } | null | undefined): Map<string, PageRef> {
  const out = new Map<string, PageRef>();
  if (!bundleRefOf(manifest)) return out;
  const pages = (manifest!.bundle as { pages?: unknown }).pages;
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) return out;
  for (const [dir, r] of Object.entries(pages as Record<string, unknown>)) {
    const { key, bytes, sha256 } = (r || {}) as Partial<PageRef>;
    if (!PAGE_DIR.test(dir) || typeof key !== "string" || !PAGE_KEY.test(key)) continue;
    if (typeof bytes !== "number" || !Number.isInteger(bytes) || bytes <= 0 || bytes > MAX_PAGE_BYTES) continue;
    if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) continue;
    out.set(dir, { key, bytes, sha256 });
  }
  return out;
}

/** A page bundle checked against its manifest entry (length, SHA-256, format, folder, paths); null when anything is off. */
export function parsePageBundle(body: string | Uint8Array, ref: PageRef, dir: string): PageBundle | null {
  const buf = typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);
  if (buf.length !== ref.bytes || buf.length > MAX_PAGE_BYTES) return null;
  if (createHash("sha256").update(buf).digest("hex") !== ref.sha256) return null;
  let j: { format?: unknown; v?: unknown; dir?: unknown; files?: unknown; skipped?: unknown };
  try {
    j = JSON.parse(buf.toString("utf8"));
  } catch {
    return null;
  }
  if (!j || j.format !== PAGE_FORMAT || j.v !== PAGE_VERSION || j.dir !== dir) return null;
  const files = stringMap(j.files, PATH);
  const inDir = (p: string) => p.startsWith(`${dir}/`);
  if (!files || ![...files.keys()].every(inDir)) return null;
  if (!Array.isArray(j.skipped) || !j.skipped.every((p) => typeof p === "string" && PATH.test(p) && !p.includes("..") && inDir(p))) return null;
  return { dir, files, skipped: new Set(j.skipped as string[]) };
}

/**
 * Page bundles read once per isolate and object (the key names the folder's content, so a kept one is never stale),
 * at most `max` held (the oldest go first, ~130 KB each). Concurrent reads of a folder share one read; a failed one
 * (missing, unreadable, checks failed) resolves to null and is tried again after `retryMs`.
 */
export function pageLoader(deps: {
  read: (key: string) => Promise<Uint8Array | string | null | undefined>;
  now?: () => number;
  retryMs?: number;
  max?: number;
  warn?: (msg: string) => void;
}): (ref: PageRef, dir: string) => Promise<PageBundle | null> {
  const now = deps.now || Date.now;
  const retryMs = deps.retryMs ?? 60_000;
  const max = deps.max ?? 48;
  const held = new Map<string, { p: Promise<PageBundle | null>; failedAt: number | null }>();
  return (ref, dir) => {
    const id = `${ref.key}|${dir}`;
    const cur = held.get(id);
    if (cur && !(cur.failedAt !== null && now() - cur.failedAt > retryMs)) {
      held.delete(id);
      held.set(id, cur); // most recently used last
      return cur.p;
    }
    const slot: { p: Promise<PageBundle | null>; failedAt: number | null } = { p: Promise.resolve(null), failedAt: null };
    slot.p = (async () => {
      const body = await deps.read(ref.key);
      const b = body ? parsePageBundle(body, ref, dir) : null;
      if (!b) {
        slot.failedAt = now();
        deps.warn?.(`${ref.key} (${dir}) ${body === null ? "missing" : body === undefined ? "unreadable" : "failed its checks"}: reading its files one by one`);
      }
      return b;
    })().catch(() => {
      slot.failedAt = now();
      return null;
    });
    held.delete(id);
    held.set(id, slot);
    while (held.size > max) held.delete(held.keys().next().value as string);
    return slot.p;
  };
}

/** A file's text from its page bundle: the text, null when the folder has no such file, undefined when it's to be read. */
export function pageText(p: PageBundle | null | undefined, path: string): string | null | undefined {
  if (!p || !path.startsWith(`${p.dir}/`)) return undefined;
  const t = p.files.get(path);
  if (t !== undefined) return t;
  return p.skipped.has(path) ? undefined : null;
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
