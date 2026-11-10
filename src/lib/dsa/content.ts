import "server-only";
import { contentManifest, listContent, readContent, readContentBundle } from "@/lib/content-r2";
import { bundleLoader, bundleText, type DsaBundle } from "./bundle";

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
 * (src/lib/dsa/bundle.ts): one object per content commit, read once per isolate.
 */

export const DSA_CONTENT_TAG = "dsa-content";

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

/** A file's text, or null when it doesn't exist. Throws when no source can answer (so a cache never stores "missing"). */
export async function readDsa(path: string): Promise<string | null> {
  if (!SAFE.test(path) || path.includes("..")) return null;
  if (!LOCAL_DIR) {
    const fromBundle = bundleText(await dsaBundle(), path);
    if (fromBundle !== undefined) return fromBundle;
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
