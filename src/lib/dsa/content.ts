import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "crypto";
import { contentManifest, listContent, readContent, readContentBundle } from "@/lib/content-r2";
import { bundleLoader, bundleText, pageDirOf, pageLoader, pageRefsOf, pageText, type DsaBundle, type PageBundle, type PageRef } from "./bundle";

/**
 * The dsa-mastery content repo, read one file at a time (paths relative to the repo root, e.g.
 * "resources/worlds/academy.yml", "generated/traces/fixed-window-sum.json").
 *
 *   development   DSA_LOCAL_DIR=/path/to/dsa-mastery → straight from disk (edits show on reload)
 *   deployed      R2: the SDM_CONTENT bucket under dsa/<DSA_BRANCH or main>/ (the repo's sync-r2 workflow)
 *   fallback      DSA_GITHUB_REPO=owner/name (optional) → GitHub's contents API with GITHUB_PERSONAL_ACCESS_TOKEN
 *
 * Nothing loads the whole repo: callers read the few files a page needs, and src/lib/dsa/load.ts caches one
 * small item per world, concept and problem. On R2 the files the indexes are built from come from the content bundle
 * (src/lib/dsa/bundle.ts): one object per content commit, read once per isolate; a lesson's or problem's own files from
 * its page bundle (one object per folder version, read with the content bundle), the rest one by one.
 */

export const DSA_CONTENT_TAG = "dsa-content";

/**
 * Set while a DSA data-cache item is being built (dsaItem). Inside one, the "dsa-content" tag needn't be added to the
 * render (the item has it) and a tag item called there is still written each time: a route handler has no React
 * cache, so the problem video list wrote it ~250 times (staging, Nov 2026).
 */
const inItem = new AsyncLocalStorage<true>();
export const inDsaItem = () => inItem.getStore() === true;

/** `fn` for unstable_cache, run as a DSA item (inDsaItem). The key parts should carry dsaItemKey(fn): see there. */
export function dsaItem<A extends unknown[], R>(fn: (...a: A) => Promise<R>): (...a: A) => Promise<R> {
  return (...a: A) => inItem.run(true, () => fn(...a));
}

/** A key part from the item's own code: unstable_cache keys on its function's source, which a wrapper would hide. */
export const dsaItemKey = (fn: (...a: never[]) => unknown) => createHash("sha1").update(String(fn)).digest("hex").slice(0, 10);

const LOCAL_DIR = process.env.DSA_LOCAL_DIR;
const BRANCH = process.env.DSA_BRANCH || "main";

/** Development reads from disk are never cached, so content edits show on the next reload. */
export const dsaFresh = () => !!LOCAL_DIR && process.env.NODE_ENV !== "production";

const SAFE = /^(?:resources|generated)\/[A-Za-z0-9._/-]+$/;

async function localRead(path: string): Promise<string | null> {
  const fs = await import("fs/promises");
  const nodePath = await import("path");
  try {
    return await fs.readFile(nodePath.resolve(LOCAL_DIR as string, path), "utf8");
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT" || (e as { code?: string }).code === "ENOTDIR") return null;
    throw e;
  }
}

async function localList(path: string): Promise<string[] | null> {
  const fs = await import("fs/promises");
  const nodePath = await import("path");
  try {
    const ents = await fs.readdir(nodePath.resolve(LOCAL_DIR as string, path), { withFileTypes: true });
    return ents.filter((e) => !e.name.startsWith(".")).map((e) => (e.isDirectory() ? `${e.name}/` : e.name));
  } catch (e) {
    if ((e as { code?: string }).code === "ENOENT" || (e as { code?: string }).code === "ENOTDIR") return null;
    throw e;
  }
}

async function githubRead(path: string): Promise<string | null | undefined> {
  const repo = process.env.DSA_GITHUB_REPO;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return undefined;
  const headers: Record<string, string> = { Accept: "application/vnd.github.v3.raw", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "systemdesignmastery" };
  if (process.env.GITHUB_PERSONAL_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_PERSONAL_ACCESS_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(BRANCH)}`, {
    headers,
    next: { revalidate: 604800, tags: [DSA_CONTENT_TAG] },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub ${res.status} for ${path}`);
  return res.text();
}

/* ------------------------------------------------------------------ the content bundle */

const loadBundle = bundleLoader({
  manifest: () => contentManifest("dsa", BRANCH),
  read: (key) => readContentBundle("dsa", key, BRANCH),
  warn: (msg) => console.warn(`[dsa-bundle] ${msg}`),
});

/**
 * The current content commit's bundle (src/lib/dsa/bundle.ts), read once per isolate and commit; null = none (local
 * files, no R2, no bundle in the manifest, a read or check failed, or DSA_BUNDLE=off): read the files one by one.
 */
export async function dsaBundle(): Promise<DsaBundle | null> {
  if (LOCAL_DIR || process.env.DSA_BUNDLE === "off") return null;
  return loadBundle();
}

/** The content commit the bundle describes, when the loaders can use it; null = no bundle (they use the data cache). */
export async function dsaBundleVersion(): Promise<string | null> {
  return (await dsaBundle())?.sha ?? null;
}

/** A problem.md's head (front matter and statement, bundle.ts problemHead) from the bundle; undefined = not in it. */
export async function readDsaHead(path: string): Promise<string | undefined> {
  return (await dsaBundle())?.heads.get(path);
}


const loadPage = pageLoader({
  read: (key) => readContentBundle("dsa", key, BRANCH),
  warn: (msg) => console.warn(`[dsa-bundle] ${msg}`),
});

/**
 * The page bundle of the lesson or problem folder a path is in (src/lib/dsa/bundle.ts), read once per isolate and
 * folder version; null = none (not a page folder, no page bundles named, DSA_BUNDLE=off, a read or check failed).
 */
async function pageBundleOf(path: string): Promise<PageBundle | null> {
  const dir = pageDirOf(path);
  if (!dir || LOCAL_DIR || process.env.DSA_BUNDLE === "off") return null;
  const ref = pageRefs(await contentManifest("dsa", BRANCH).catch(() => null)).get(dir);
  return ref ? loadPage(ref, dir) : null;
}

/** The manifest's page bundles, worked out once per manifest (its bundle entry is the same object until it changes). */
const refsMemo = new WeakMap<object, Map<string, PageRef>>();
function pageRefs(m: { sha: string; bundle: unknown } | null): Map<string, PageRef> {
  const key = m?.bundle && typeof m.bundle === "object" ? m.bundle : null;
  if (!key) return pageRefsOf(m);
  let refs = refsMemo.get(key);
  if (!refs) refsMemo.set(key, (refs = pageRefsOf(m)));
  return refs;
}

/**
 * Start reading the content bundle and a page's bundle without waiting: a page calls it first, so both are read at the
 * same time, and while its cached item is looked up (~0.2 s for one that isn't there yet, staging, Nov 2026). `page`:
 * a problem id or a lesson id (its folder is found among the manifest's page bundles, no index needed).
 */
export function prefetchDsa(page?: { problem: string } | { lesson: string }): void {
  if (LOCAL_DIR || process.env.DSA_BUNDLE === "off") return;
  dsaBundle().catch(() => {});
  if (!page) return;
  (async () => {
    if ("problem" in page) return pageBundleOf(`resources/problems/${page.problem}/problem.md`);
    const refs = pageRefs(await contentManifest("dsa", BRANCH).catch(() => null));
    const dir = [...refs.keys()].find((d) => !d.startsWith("resources/problems/") && d.endsWith(`/${page.lesson}`));
    return dir ? pageBundleOf(`${dir}/lesson.md`) : null;
  })().catch(() => {});
}

/** A file's text, or null when it doesn't exist. Throws when no source can answer (so a cache never stores "missing"). */
export async function readDsa(path: string): Promise<string | null> {
  if (!SAFE.test(path) || path.includes("..")) return null;
  if (!LOCAL_DIR) {
    // a file the manifest doesn't list doesn't exist at this commit: no read
    if ((await listContent("dsa", path, BRANCH).catch(() => null))?.kind === "missing") return null;
    const fromBundle = bundleText(await dsaBundle(), path);
    if (fromBundle !== undefined) return fromBundle;
    // only then the folder's page bundle: other lessons' lab.yml (in the content bundle) loaded 15 page bundles for
    // the academy map (staging, Nov 2026). The page's own is already on its way (prefetchDsa).
    const fromPage = pageText(await pageBundleOf(path), path);
    if (fromPage !== undefined) return fromPage;
  }
  if (LOCAL_DIR) return localRead(path);
  const r2 = await readContent("dsa", path, BRANCH);
  if (r2 !== undefined) return r2;
  const gh = await githubRead(path);
  if (gh !== undefined) return gh;
  throw new Error(`DSA content unavailable (${path}): set DSA_LOCAL_DIR, or sync the dsa-mastery repo to R2`);
}

/** Directory entries ("name" for files, "name/" for folders); null when the folder doesn't exist. */
export async function listDsa(path: string): Promise<string[] | null> {
  const clean = path.replace(/^\/+|\/+$/g, "");
  if (!SAFE.test(clean) || clean.includes("..")) return null;
  if (LOCAL_DIR) return localList(clean);
  const r = await listContent("dsa", clean, BRANCH);
  if (r) return r.kind === "dir" ? r.entries : null;
  throw new Error(`DSA content listing unavailable (${clean}): set DSA_LOCAL_DIR, or sync the dsa-mastery repo to R2`);
}

/** JSON file, or null when missing or malformed. */
export async function readDsaJson<T>(path: string): Promise<T | null> {
  const t = await readDsa(path);
  if (t == null) return null;
  try {
    return JSON.parse(t) as T;
  } catch {
    return null;
  }
}
